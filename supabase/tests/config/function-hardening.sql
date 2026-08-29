-- Configuration regression for OWASP A02 function hardening.
--
-- Reproduces the live pre-fix state of the three flagged functions on a
-- throwaway PostgreSQL, asserts the insecure/permissive properties, applies the
-- migration, and asserts they are gone AND that behaviour is unchanged.
--
-- Run:  psql -v ON_ERROR_STOP=1 -f function-hardening.sql
--       (see run.sh)

\set ON_ERROR_STOP on
\set QUIET on

-- ---------------------------------------------------------------------------
-- Reproduce the live pre-fix state.
-- ---------------------------------------------------------------------------
create schema if not exists public;
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $$;
grant usage on schema public to anon, authenticated;

-- Verbatim shape of the three live functions (definitions read from the
-- production catalog with pg_get_functiondef).
create or replace function public.rls_auto_enable()
returns event_trigger language plpgsql security definer set search_path to 'pg_catalog'
as $fn$
declare cmd record;
begin
  for cmd in
    select * from pg_event_trigger_ddl_commands()
    where command_tag in ('CREATE TABLE','CREATE TABLE AS','SELECT INTO')
      and object_type in ('table','partitioned table')
  loop
    if cmd.schema_name is not null and cmd.schema_name in ('public') then
      begin
        execute format('alter table if exists %s enable row level security', cmd.object_identity);
      exception when others then null;
      end;
    end if;
  end loop;
end;
$fn$;

create or replace function public.set_updated_at()
returns trigger language plpgsql
as $fn$ begin new.updated_at = now(); return new; end; $fn$;

create or replace function public.force_legal_acceptance_times()
returns trigger language plpgsql
as $fn$ begin new.occurred_at = now(); new.created_at = now(); return new; end; $fn$;

-- The live ACL: EXECUTE held by PUBLIC, anon and authenticated.
grant execute on function public.rls_auto_enable() to public, anon, authenticated;

-- A table exercising both triggers.
create table public.probe (
  id int primary key,
  updated_at timestamptz,
  occurred_at timestamptz,
  created_at timestamptz
);
create trigger probe_set_updated before insert on public.probe
  for each row execute function public.set_updated_at();
create trigger probe_force_times before insert on public.probe
  for each row execute function public.force_legal_acceptance_times();

-- ---------------------------------------------------------------------------
-- BEFORE: assert the permissive state actually exists (no fake RED).
-- ---------------------------------------------------------------------------
do $$
begin
  if not has_function_privilege('anon','public.rls_auto_enable()','EXECUTE') then
    raise exception 'PRECONDITION FAILED: anon should hold EXECUTE before the fix';
  end if;
  if not has_function_privilege('authenticated','public.rls_auto_enable()','EXECUTE') then
    raise exception 'PRECONDITION FAILED: authenticated should hold EXECUTE before the fix';
  end if;
  if (select proconfig from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname='set_updated_at') is not null then
    raise exception 'PRECONDITION FAILED: set_updated_at should have a mutable search_path before the fix';
  end if;
  if (select proconfig from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname='force_legal_acceptance_times') is not null then
    raise exception 'PRECONDITION FAILED: force_legal_acceptance_times should have a mutable search_path before the fix';
  end if;
  raise notice 'BEFORE: permissive state reproduced (grants present, search_path unset)';
end $$;

-- The core claim behind the severity call: the function is NOT invocable, so
-- the grants are inert. Assert PostgreSQL refuses it.
do $$
declare st text; msg text;
begin
  begin
    perform public.rls_auto_enable();
    raise exception 'SECURITY: rls_auto_enable() was invocable as an ordinary function';
  exception
    when sqlstate '0A000' then
      get stacked diagnostics msg = message_text;
      raise notice 'BEFORE: rls_auto_enable() not invocable (0A000: %)', msg;
    when others then
      get stacked diagnostics st = returned_sqlstate, msg = message_text;
      raise exception 'unexpected error invoking rls_auto_enable(): % %', st, msg;
  end;
end $$;

-- Baseline behaviour of the triggers.
insert into public.probe(id) values (1);
do $$
begin
  if (select updated_at from public.probe where id=1) is null
     or (select occurred_at from public.probe where id=1) is null
     or (select created_at from public.probe where id=1) is null then
    raise exception 'PRECONDITION FAILED: triggers should populate timestamps before the fix';
  end if;
  raise notice 'BEFORE: triggers populate timestamps';
end $$;

-- ---------------------------------------------------------------------------
-- Apply the migration under test.
-- ---------------------------------------------------------------------------
revoke execute on function public.rls_auto_enable() from public;
revoke execute on function public.rls_auto_enable() from anon;
revoke execute on function public.rls_auto_enable() from authenticated;
alter function public.set_updated_at() set search_path = pg_catalog;
alter function public.force_legal_acceptance_times() set search_path = pg_catalog;

-- ---------------------------------------------------------------------------
-- AFTER: the permissive state is gone and behaviour is unchanged.
-- ---------------------------------------------------------------------------
do $$
begin
  if has_function_privilege('anon','public.rls_auto_enable()','EXECUTE') then
    raise exception 'FAIL: anon still holds EXECUTE on rls_auto_enable()';
  end if;
  if has_function_privilege('authenticated','public.rls_auto_enable()','EXECUTE') then
    raise exception 'FAIL: authenticated still holds EXECUTE on rls_auto_enable()';
  end if;
  if (select proconfig from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname='set_updated_at')
     is distinct from array['search_path=pg_catalog'] then
    raise exception 'FAIL: set_updated_at search_path not pinned';
  end if;
  if (select proconfig from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname='force_legal_acceptance_times')
     is distinct from array['search_path=pg_catalog'] then
    raise exception 'FAIL: force_legal_acceptance_times search_path not pinned';
  end if;
  raise notice 'AFTER: grants revoked and search_path pinned';
end $$;

-- The event trigger control must survive: it is what auto-enables RLS.
do $$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                 where n.nspname='public' and p.proname='rls_auto_enable') then
    raise exception 'FAIL: rls_auto_enable() was dropped — that is a security control';
  end if;
  raise notice 'AFTER: rls_auto_enable() still present (security control intact)';
end $$;

-- Behaviour unchanged: triggers still populate timestamps with the pinned path.
insert into public.probe(id) values (2);
do $$
begin
  if (select updated_at from public.probe where id=2) is null
     or (select occurred_at from public.probe where id=2) is null
     or (select created_at from public.probe where id=2) is null then
    raise exception 'FAIL: pinning search_path broke the timestamp triggers';
  end if;
  raise notice 'AFTER: triggers still populate timestamps (now() resolves under pinned path)';
end $$;

-- Even with a hostile session search_path, resolution is stable.
set search_path = pg_temp, public;
insert into public.probe(id) values (3);
do $$
begin
  if (select updated_at from public.probe where id=3) is null then
    raise exception 'FAIL: trigger broke under a hostile session search_path';
  end if;
  raise notice 'AFTER: triggers stable under a hostile session search_path';
end $$;
reset search_path;

\echo 'PASS: A02 function hardening verified (permissive state removed, behaviour preserved).'
