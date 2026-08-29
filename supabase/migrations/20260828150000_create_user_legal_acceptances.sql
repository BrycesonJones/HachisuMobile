-- Durable, versioned legal-consent capture.
--
-- One row per (user, document, version). Terms of Service and the E-Sign
-- Consent are AGREEMENTS (action = 'accepted'); the Privacy Notice is a
-- NOTICE the user acknowledges receiving (action = 'presented') — it is
-- deliberately not modeled as a contractual acceptance.
--
-- Versions are explicit strings (e.g. 'terms_2026-08-28_v1') owned by the app
-- constant CURRENT_*_VERSION in constants/legal.ts. Bumping a constant makes
-- the client's legal gate require re-acceptance; the old rows remain as the
-- historical record of what was accepted when.
--
-- Trust model:
--   * RLS restricts reads and writes to the row owner; there is intentionally
--     no UPDATE or DELETE policy — acceptance rows are immutable and are only
--     removed by the auth.users ON DELETE CASCADE when the account is deleted.
--   * Timestamps are forced server-side by trigger so a client can never
--     backdate or forward-date an acceptance.
--   * We deliberately capture NO device metadata, IP address, or fingerprint:
--     user id + document + version + source + server time is sufficient
--     evidence for the MVP.

create table public.user_legal_acceptances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,

  document text not null,
  version text not null,

  -- 'accepted' for agreements, 'presented' for notices (Privacy Notice).
  action text not null,

  -- Where in the product the record was captured.
  source text not null,

  -- Server-authoritative moment of acceptance/presentation (trigger-enforced).
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),

  constraint user_legal_acceptances_document_check
    check (document in ('terms_of_service', 'esign_consent', 'privacy_notice')),
  constraint user_legal_acceptances_action_check
    check (action in ('accepted', 'presented')),
  -- The Privacy Notice is presented, never "agreed to"; Terms/E-Sign are the
  -- inverse. Enforce the pairing so a bug cannot record the wrong kind.
  constraint user_legal_acceptances_action_pairing_check
    check (
      (document = 'privacy_notice' and action = 'presented')
      or (document <> 'privacy_notice' and action = 'accepted')
    ),
  constraint user_legal_acceptances_source_check
    check (source in ('onboarding', 'legal_gate')),
  constraint user_legal_acceptances_version_not_blank
    check (length(trim(version)) > 0),

  -- Repeated taps / retries upsert into the same row (ON CONFLICT DO NOTHING
  -- client-side), so duplicates are structurally impossible.
  unique (user_id, document, version)
);

create index user_legal_acceptances_user_id_idx
  on public.user_legal_acceptances (user_id);

-- Server-authoritative timestamps: whatever the client sends is overwritten.
create or replace function public.force_legal_acceptance_times()
returns trigger language plpgsql as $$
begin
  new.occurred_at = now();
  new.created_at = now();
  return new;
end;
$$;

create trigger user_legal_acceptances_force_times
  before insert on public.user_legal_acceptances
  for each row execute function public.force_legal_acceptance_times();

alter table public.user_legal_acceptances enable row level security;

create policy "legal_acceptances_select_own"
  on public.user_legal_acceptances for select
  using (auth.uid() = user_id);

create policy "legal_acceptances_insert_own"
  on public.user_legal_acceptances for insert
  with check (auth.uid() = user_id);

-- No UPDATE/DELETE policies: rows are immutable for authenticated users.
