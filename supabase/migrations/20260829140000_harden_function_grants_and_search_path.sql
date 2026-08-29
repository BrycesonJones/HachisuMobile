-- OWASP A02:2025 — Security Misconfiguration. Database function hardening.
--
-- These are DEFENSE-IN-DEPTH changes. Both advisor findings they address were
-- investigated adversarially and proven NOT exploitable in the current schema
-- (evidence recorded in the A02 audit). They are applied because the permissive
-- state is unnecessary, not because an attack exists.
--
--------------------------------------------------------------------------------
-- 1. public.rls_auto_enable() — revoke EXECUTE from untrusted roles.
--------------------------------------------------------------------------------
-- The Supabase advisor reports this SECURITY DEFINER function as callable by
-- `anon` and `authenticated` via /rest/v1/rpc/rls_auto_enable.
--
-- Verified before this migration:
--   * It RETURNS event_trigger, so PostgreSQL refuses to invoke it as an
--     ordinary function. Direct SQL invocation fails with SQLSTATE 0A000
--     ("trigger functions can only be called as triggers"), and the live
--     PostgREST RPC path returns HTTP 400 / 0A000 ("cannot display a value of
--     type event_trigger") for the anon role. The body never executes.
--   * Its search_path is already pinned to pg_catalog.
--   * It takes no arguments, so there is no attacker-controlled input.
--
-- The grants are therefore inert — but they are also pointless, and they keep a
-- SECURITY DEFINER function listed on the public API surface. Revoking them
-- removes the surface and clears the advisor.
--
-- IMPORTANT: the function itself and its `ensure_rls` event trigger are a
-- SECURITY CONTROL — they auto-enable RLS on every new table in `public`.
-- Do NOT drop either. Only the redundant EXECUTE grants are removed.
revoke execute on function public.rls_auto_enable() from public;
revoke execute on function public.rls_auto_enable() from anon;
revoke execute on function public.rls_auto_enable() from authenticated;

--------------------------------------------------------------------------------
-- 2. Pin search_path on the two trigger functions flagged as mutable.
--------------------------------------------------------------------------------
-- Verified before this migration:
--   * Both are SECURITY INVOKER, so they carry no elevated privilege.
--   * Both reference only now(), which lives in pg_catalog. pg_catalog is
--     implicitly searched first when it is not named explicitly in the path, so
--     now() cannot be shadowed by a same-named object in another schema.
--   * has_schema_privilege('anon','public','CREATE') and the same for
--     'authenticated' are both FALSE, so an untrusted role cannot create a
--     shadowing object in `public` in the first place.
--
-- Pinning the path makes name resolution independent of the caller's session
-- regardless, which is the standard posture for a trigger function and clears
-- the advisor. Behaviour is unchanged: now() resolves to pg_catalog.now() in
-- both the old and new configuration.
alter function public.set_updated_at() set search_path = pg_catalog;
alter function public.force_legal_acceptance_times() set search_path = pg_catalog;
