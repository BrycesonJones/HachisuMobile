-- Pre-fix state, verbatim in effect: Supabase's default TABLE-level grants.
-- RLS is row-scoped, so the owner may rewrite ANY column of their own row —
-- including the server-owned BTCPay "default store summary".
grant select, insert, update on public.user_profiles to authenticated;
