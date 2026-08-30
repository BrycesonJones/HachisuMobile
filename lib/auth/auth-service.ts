import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';

import { isAuthDevBypassEnabled, isProfileDebugEnabled } from '@/lib/auth/config';
import {
  clearDevAuth,
  getDevProfile,
  isDevAuthActive,
  updateDevProfile,
  type DevProfileUpdates,
} from '@/lib/auth/dev-session';
import { readFunctionError } from '@/lib/btcpay/function-error';
import { createMerchantStore } from '@/lib/btcpay/stores';
import { recordCurrentLegalAcceptance } from '@/lib/legal/consent';
import { supabase } from '@/lib/supabase';
import type { AccountType, OnboardingStatus, UserProfile } from '@/types/user-profile';

export interface AuthError {
  message: string;
}

export interface EnsureUserProfileInput {
  email: string;
  accountType: AccountType;
  onboardingStatus?: OnboardingStatus;
}

/**
 * The user_profiles columns the client may write.
 *
 * The same row also carries the server-owned BTCPay "default store summary"
 * (btcpay_store_id, wallet/onchain/lightning status, store_count,
 * default_merchant_store_id, …). Those are written only by the Edge Functions
 * via the service role, and since
 * 20260830120000_lock_down_user_profile_server_columns the client has no grant
 * on them at all — a write naming one is rejected by PostgreSQL.
 *
 * Listing the writable columns here rather than subtracting a couple from the
 * row type keeps the client type in step with the grant: a new server-owned
 * column is excluded by default instead of quietly becoming writable-looking,
 * and passing one is a compile error rather than a runtime permission failure.
 */
export type WritableProfileColumn =
  | 'email'
  | 'account_type'
  | 'onboarding_status'
  | 'onboarding_completed'
  | 'username'
  | 'display_name'
  | 'full_name'
  | 'phone'
  | 'country'
  | 'personal_address'
  | 'business_name'
  | 'business_address'
  | 'business_website'
  | 'business_country'
  | 'business_description'
  | 'expected_monthly_volume';

export type UpsertProfileInput = Partial<Pick<UserProfile, WritableProfileColumn>>;

function toAuthError(error: { message: string }): AuthError {
  return { message: error.message };
}

function debugLog(label: string, payload: Record<string, unknown>) {
  if (!isProfileDebugEnabled) return;
  console.log(`[profile] ${label}`, payload);
}

// Safe auth-flow logging. Never logs OTP codes, access/refresh tokens, or keys.
function authLog(label: string, payload: Record<string, unknown>) {
  if (!isProfileDebugEnabled) return;
  console.log(`[auth] ${label}`, payload);
}

/**
 * Sends a one-time passcode to the user's email.
 * In dev bypass mode, skips the network call so UI flows can be tested without email delivery.
 *
 * `shouldCreateUser` defaults to true (sign-up). Login passes false so an
 * unknown email can never create an account through the login screen.
 */
export async function sendEmailOtp(
  email: string,
  options: { shouldCreateUser?: boolean } = {},
): Promise<{ error: AuthError | null }> {
  const trimmedEmail = email.trim();
  const shouldCreateUser = options.shouldCreateUser ?? true;

  if (isAuthDevBypassEnabled) {
    console.warn('[auth] Dev bypass: skipping signInWithOtp for', trimmedEmail);
    return { error: null };
  }

  authLog('signInWithOtp:request', { email: trimmedEmail, shouldCreateUser });

  const { error } = await supabase.auth.signInWithOtp({
    email: trimmedEmail,
    options: { shouldCreateUser },
  });

  authLog('signInWithOtp:result', { email: trimmedEmail, sent: !error, message: error?.message });

  if (error) {
    return { error: toAuthError(error) };
  }

  return { error: null };
}

/**
 * Verifies the email OTP and establishes a Supabase session.
 * Dev bypass is handled separately via activateDevAuth in AuthContext — never call this in dev mode.
 */
export async function verifyEmailOtp(
  email: string,
  token: string,
): Promise<{ error: AuthError | null }> {
  const trimmedEmail = email.trim();

  const { data, error } = await supabase.auth.verifyOtp({
    email: trimmedEmail,
    token,
    type: 'email',
  });

  authLog('verifyOtp:result', {
    email: trimmedEmail,
    verified: !error,
    userId: data?.user?.id,
    message: error?.message,
  });

  if (error) {
    return { error: toAuthError(error) };
  }

  return { error: null };
}

/**
 * Permanently deletes the authenticated user's account via the delete-account
 * Edge Function. The server derives the target account from the verified JWT;
 * no user id is (or can be) supplied by the client. On error the account and
 * the local session are both still intact — the caller must NOT clear state.
 */
export async function deleteAccount(): Promise<{ error: AuthError | null }> {
  const { data, error } = await supabase.functions.invoke<{ ok?: boolean; error?: string }>(
    'delete-account',
    { method: 'POST', body: {} },
  );

  authLog('deleteAccount:result', { ok: !error && data?.ok === true, message: error?.message });

  if (error) {
    const detail = await readFunctionError(error);
    return { error: { message: detail ?? 'Could not close your account. Please try again.' } };
  }
  if (data?.ok !== true) {
    return {
      error: { message: data?.error ?? 'Could not close your account. Please try again.' },
    };
  }
  return { error: null };
}

export async function signOut(): Promise<{ error: AuthError | null }> {
  if (isDevAuthActive()) {
    clearDevAuth();
    return { error: null };
  }

  const { error } = await supabase.auth.signOut();

  if (error) {
    return { error: toAuthError(error) };
  }

  return { error: null };
}

export async function fetchUserProfile(userId: string): Promise<UserProfile | null> {
  if (isDevAuthActive()) {
    return getDevProfile();
  }

  const { data, error } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    debugLog('fetchUserProfile error', { userId, message: error.message });
    throw new Error(error.message);
  }

  debugLog('fetchUserProfile result', {
    userId,
    found: data != null,
    onboarding_completed: data?.onboarding_completed,
    account_type: data?.account_type,
  });

  return data;
}

/**
 * Ensures a user_profiles row exists for the authenticated user.
 * Idempotent: uses upsert keyed on id.
 */
export async function ensureUserProfile(
  input: EnsureUserProfileInput,
): Promise<{ profile: UserProfile | null; error: AuthError | null }> {
  if (isDevAuthActive()) {
    const profile = updateDevProfile({
      email: input.email.trim(),
      account_type: input.accountType,
      onboarding_status: input.onboardingStatus ?? 'email_verified',
    });
    return { profile, error: null };
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return {
      profile: null,
      error: { message: userError?.message ?? 'No authenticated user' },
    };
  }

  const existing = await fetchUserProfile(user.id);

  // Preserve account_type if a row already exists (don't downgrade business → personal on login).
  const accountType = existing?.account_type ?? input.accountType;
  const onboardingStatus =
    input.onboardingStatus ?? (existing?.onboarding_status as OnboardingStatus | undefined) ?? 'email_verified';

  const payload = {
    id: user.id,
    email: input.email.trim(),
    account_type: accountType,
    onboarding_status: onboardingStatus,
  };

  debugLog('ensureUserProfile upsert', { userId: user.id, keys: Object.keys(payload) });

  const { data, error } = await supabase
    .from('user_profiles')
    .upsert(payload, { onConflict: 'id' })
    .select('*')
    .single();

  if (error) {
    debugLog('ensureUserProfile error', { userId: user.id, message: error.message });
    return { profile: null, error: toAuthError(error) };
  }

  debugLog('ensureUserProfile success', {
    userId: user.id,
    onboarding_status: data?.onboarding_status,
  });

  return { profile: data, error: null };
}

/**
 * Idempotently writes profile fields for the authenticated user. Pass any subset of profile columns.
 * If no row exists yet, account_type and email must be present (or already on the row).
 */
export async function upsertUserProfile(
  input: UpsertProfileInput,
): Promise<{ profile: UserProfile | null; error: AuthError | null }> {
  if (isDevAuthActive()) {
    const profile = updateDevProfile(input as DevProfileUpdates);
    return { profile, error: null };
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return {
      profile: null,
      error: { message: userError?.message ?? 'No authenticated user' },
    };
  }

  const existing = await fetchUserProfile(user.id);

  // For first-time inserts, account_type and email are required NOT NULL columns.
  const accountType = input.account_type ?? existing?.account_type;
  const email = input.email ?? existing?.email ?? user.email;

  if (!accountType || !email) {
    return {
      profile: null,
      error: { message: 'Cannot create profile without account_type and email' },
    };
  }

  const payload = {
    ...input,
    id: user.id,
    account_type: accountType,
    email,
  };

  debugLog('upsertUserProfile', { userId: user.id, keys: Object.keys(input) });

  const { data, error } = await supabase
    .from('user_profiles')
    .upsert(payload, { onConflict: 'id' })
    .select('*')
    .single();

  if (error) {
    debugLog('upsertUserProfile error', { userId: user.id, message: error.message });
    return { profile: null, error: toAuthError(error) };
  }

  debugLog('upsertUserProfile success', {
    userId: user.id,
    onboarding_status: data?.onboarding_status,
    onboarding_completed: data?.onboarding_completed,
  });

  return { profile: data, error: null };
}

/**
 * Picks a sensible default store name from the freshly-onboarded profile:
 * business name for business accounts, the person's name otherwise, with
 * fallbacks. Capped at the BTCPay store-name length limit (50).
 */
function deriveFirstStoreName(profile: UserProfile): string {
  const base =
    profile.account_type === 'business' ? profile.business_name : profile.full_name;
  const name = (base || profile.display_name || profile.username || 'My Store').trim();
  return (name || 'My Store').slice(0, 50);
}

/**
 * Provisions the merchant's first store right after onboarding so they land on
 * a ready dashboard (POS / Invoices / etc. all require a store). Non-blocking:
 * a failure just leaves the existing "Create Store" call-to-action in place.
 * Skipped if the profile already reports a store.
 */
async function ensureFirstStore(profile: UserProfile): Promise<void> {
  try {
    if ((profile.store_count ?? 0) > 0) return;
    const { error } = await createMerchantStore({
      name: deriveFirstStoreName(profile),
      defaultCurrency: 'USD',
    });
    if (error) authLog('first store provisioning failed', { message: error });
  } catch (err) {
    authLog('first store provisioning threw', { message: String(err) });
  }
}

/**
 * Marks onboarding as complete and writes any final profile fields in one
 * upsert, then provisions the merchant's first store.
 *
 * Persists the legal acceptance record FIRST: every completion screen shows
 * the "By tapping …, you agree to the Terms of Service …" disclosure above
 * its action button, and onboarding must never finish without that
 * acceptance durably recorded. The write is idempotent (unique per
 * user/document/version), so a retried finalization cannot create duplicate
 * records; on failure onboarding stays incomplete and the caller's normal
 * error/retry path applies.
 */
export async function completeOnboarding(
  input: UpsertProfileInput = {},
): Promise<{ profile: UserProfile | null; error: AuthError | null }> {
  const { error: consentError } = await recordCurrentLegalAcceptance('onboarding');
  if (consentError) {
    return { profile: null, error: { message: consentError.message } };
  }

  const result = await upsertUserProfile({
    ...input,
    onboarding_completed: true,
    onboarding_status: 'onboarding_complete',
  });

  if (!result.error && result.profile) {
    await ensureFirstStore(result.profile);
  }

  return result;
}

/**
 * Backwards-compatible: thin wrapper around upsertUserProfile for code paths that still
 * use the narrow username / onboarding_status update signature.
 */
export async function updateUserProfile(
  updates: UpsertProfileInput,
): Promise<{ profile: UserProfile | null; error: AuthError | null }> {
  return upsertUserProfile(updates);
}


/**
 * Parses a Supabase OAuth callback URL. Tokens arrive in the URL fragment on
 * the implicit flow and as a `code` query param on PKCE; errors can appear in
 * either place, so both parts are merged.
 */
function parseOAuthCallbackParams(url: string): Record<string, string> {
  const params: Record<string, string> = {};
  const [beforeFragment, fragment] = url.split('#');
  const query = beforeFragment.split('?')[1];

  for (const part of [query, fragment]) {
    if (!part) continue;
    for (const pair of part.split('&')) {
      const [key, ...rest] = pair.split('=');
      if (!key) continue;
      try {
        params[decodeURIComponent(key)] = decodeURIComponent(rest.join('='));
      } catch {
        // Skip malformed pairs rather than failing the whole callback.
      }
    }
  }

  return params;
}

/**
 * Signs the user in with Google via Supabase's browser-based OAuth flow
 * (expo-web-browser auth session; works in Expo Go — no native module).
 * `cancelled` means the user dismissed the browser; that is not an error.
 */
export async function signInWithGoogleOAuth(): Promise<{
  error: AuthError | null;
  cancelled?: boolean;
}> {
  if (isAuthDevBypassEnabled) {
    return { error: { message: 'Google sign-in is unavailable in dev bypass mode. Use email.' } };
  }

  // In Expo Go this is exp://<host>/--/ and in a standalone build
  // hachisumobile://. Must be listed in the Supabase auth redirect allowlist.
  const redirectTo = Linking.createURL('');

  authLog('google:request', { redirectTo });

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo, skipBrowserRedirect: true },
  });

  if (error) {
    return { error: toAuthError(error) };
  }
  if (!data?.url) {
    return { error: { message: 'Could not start Google sign-in.' } };
  }

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);

  if (result.type !== 'success') {
    authLog('google:dismissed', { type: result.type });
    return { error: null, cancelled: true };
  }

  const params = parseOAuthCallbackParams(result.url);

  if (params.error_description || params.error) {
    return { error: { message: params.error_description || params.error } };
  }

  if (params.code) {
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(params.code);
    authLog('google:exchange', { ok: !exchangeError });
    return { error: exchangeError ? toAuthError(exchangeError) : null };
  }

  if (params.access_token && params.refresh_token) {
    const { error: sessionError } = await supabase.auth.setSession({
      access_token: params.access_token,
      refresh_token: params.refresh_token,
    });
    authLog('google:setSession', { ok: !sessionError });
    return { error: sessionError ? toAuthError(sessionError) : null };
  }

  return { error: { message: 'Google sign-in did not return a session.' } };
}

/** The pre-auth business signup answers carried through the flow as route params. */
export interface BusinessSignupParams {
  username?: string;
  business_name?: string;
  business_address?: string;
  business_website?: string;
  business_country?: string;
  business_description?: string;
  expected_monthly_volume?: string;
}

export type FinalizeBusinessSignupResult =
  | { status: 'completed' }
  /** Not finalized (already-complete account, or missing answers): route by profile. */
  | { status: 'resume'; profile: UserProfile | null }
  | { status: 'error'; error: AuthError };

function nonEmpty(value: string | undefined): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

/**
 * The single finalization point for business sign-up, shared by every
 * authentication method (email OTP, Google OAuth). Requires an authenticated
 * session. Ensures the profile row exists, protects already-completed
 * accounts, then commits the carried answers through the existing
 * completeOnboarding lifecycle (profile upsert + onboarding_completed +
 * first-store/BTCPay provisioning).
 */
export async function finalizeBusinessSignup(
  email: string | null,
  accountType: AccountType,
  params: BusinessSignupParams,
): Promise<FinalizeBusinessSignupResult> {
  let resolvedEmail = nonEmpty(email ?? undefined);

  if (!resolvedEmail && !isDevAuthActive()) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    resolvedEmail = nonEmpty(user?.email);
  }

  if (!resolvedEmail) {
    return { status: 'error', error: { message: 'No email on the authenticated account.' } };
  }

  const { profile, error: profileError } = await ensureUserProfile({
    email: resolvedEmail,
    accountType,
    onboardingStatus: 'email_verified',
  });

  if (profileError) {
    return { status: 'error', error: profileError };
  }

  // An account that already finished onboarding is signing back in: never
  // overwrite it with this session's answers, and never re-provision.
  if (profile?.onboarding_completed) {
    return { status: 'resume', profile };
  }

  const username = nonEmpty(params.username);
  const businessName = nonEmpty(params.business_name);
  const businessAddress = nonEmpty(params.business_address);
  const businessCountry = nonEmpty(params.business_country);
  const businessDescription = nonEmpty(params.business_description);
  const expectedMonthlyVolume = nonEmpty(params.expected_monthly_volume);

  // The business flow always arrives with the full set of carried answers.
  // Reached without them (a stale link, an interrupted flow), resume
  // onboarding instead of marking it complete with holes.
  if (
    !username ||
    !businessName ||
    !businessAddress ||
    !businessCountry ||
    !businessDescription ||
    !expectedMonthlyVolume
  ) {
    return { status: 'resume', profile };
  }

  const { error } = await completeOnboarding({
    account_type: accountType,
    username,
    business_name: businessName,
    business_address: businessAddress,
    business_website: nonEmpty(params.business_website),
    business_country: businessCountry,
    business_description: businessDescription,
    expected_monthly_volume: expectedMonthlyVolume,
  });

  if (error) {
    return { status: 'error', error };
  }

  return { status: 'completed' };
}
