-- RLS regression harness (A01 Broken Access Control).
--
-- Reproduces the security-relevant slice of the Hachisu schema on a bare
-- PostgreSQL so the merchant_stores / merchant_pos_apps write policies can be
-- tested exactly the way Supabase enforces them:
--   * auth.uid() reads request.jwt.claims->>'sub' (identical to Supabase GoTrue).
--   * the `authenticated` role is a PUBLIC member and holds the same default
--     table grants Supabase issues (SELECT/INSERT/UPDATE/DELETE).
--   * the table owner (postgres) seeds rows bypassing RLS, mirroring the
--     service-role writes performed by the edge functions.
--
-- This file sets up schema + seed only. A policy file (_policies_vulnerable.sql
-- or _policies_fixed.sql) and then _attack.sql are run on top of it.

set client_min_messages = warning;

drop schema if exists auth cascade;
create schema auth;

-- Supabase's auth.uid(): the caller identity comes solely from the JWT claim.
create or replace function auth.uid() returns uuid
  language sql stable
as $$
  select nullif(current_setting('request.jwt.claims', true)::json ->> 'sub', '')::uuid
$$;

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
end $$;

drop table if exists public.merchant_pos_apps cascade;
drop table if exists public.merchant_stores cascade;

-- Security-relevant columns only (ownership, the BTCPay routing identifiers the
-- edge functions trust, and the on-chain operation-lock safety primitives).
create table public.merchant_stores (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  btcpay_store_id text not null,
  onchain_status text not null default 'not_connected',
  wallet_status text not null default 'store_created',
  onchain_operation text not null default 'none',
  onchain_operation_token text,
  onchain_scheme_fingerprint text,
  is_default boolean not null default false
);
create unique index merchant_stores_btcpay_store_id_unique
  on public.merchant_stores (btcpay_store_id);

create table public.merchant_pos_apps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  merchant_store_id uuid not null,
  btcpay_store_id text not null,
  btcpay_app_id text not null,
  app_name text not null,
  status text not null default 'active'
);
create unique index merchant_pos_apps_btcpay_app_id_unique
  on public.merchant_pos_apps (btcpay_app_id);

alter table public.merchant_stores enable row level security;
alter table public.merchant_pos_apps enable row level security;

-- Match Supabase's default grants to the authenticated role.
grant select, insert, update, delete on public.merchant_stores to authenticated;
grant select, insert, update, delete on public.merchant_pos_apps to authenticated;

-- Two tenants. Seeded by the table owner (postgres), which bypasses RLS just as
-- the service-role edge functions do.
--   User A = attacker  11111111-1111-1111-1111-111111111111
--   User B = victim    22222222-2222-2222-2222-222222222222
insert into public.merchant_stores (id, user_id, btcpay_store_id, onchain_status, onchain_operation, onchain_operation_token)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'BTCPAY-STORE-A', 'connected', 'replace', 'lock-token-A'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '22222222-2222-2222-2222-222222222222', 'BTCPAY-STORE-B', 'connected', 'none', null);

insert into public.merchant_pos_apps (id, user_id, merchant_store_id, btcpay_store_id, btcpay_app_id, app_name)
values
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', '22222222-2222-2222-2222-222222222222', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'BTCPAY-STORE-B', 'VICTIM-APP-B', 'Victim POS');
