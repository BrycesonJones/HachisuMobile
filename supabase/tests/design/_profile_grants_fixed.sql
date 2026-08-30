-- Post-fix state: mirrors
-- supabase/migrations/20260830120000_lock_down_user_profile_server_columns.sql.
-- Column-level grants make the server-owned summary columns unwritable by the
-- client while every profile-hub field the app edits stays writable.
revoke insert, update, delete on public.user_profiles from anon, authenticated;
grant select on public.user_profiles to authenticated;
grant insert (
  id, email, account_type, onboarding_status, onboarding_completed, username,
  display_name, full_name, phone, country, personal_address,
  business_name, business_address, business_website, business_country,
  business_description, expected_monthly_volume
) on public.user_profiles to authenticated;
grant update (
  id, email, account_type, onboarding_status, onboarding_completed, username,
  display_name, full_name, phone, country, personal_address,
  business_name, business_address, business_website, business_country,
  business_description, expected_monthly_volume
) on public.user_profiles to authenticated;
