import { isAuthDevBypassEnabled, isProfileDebugEnabled } from '@/lib/auth/config';
import {
  clearDevAuth,
  getDevProfile,
  isDevAuthActive,
  updateDevProfile,
  type DevProfileUpdates,
} from '@/lib/auth/dev-session';
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

export type UpsertProfileInput = Partial<Omit<UserProfile, 'id' | 'created_at' | 'updated_at'>>;

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
 */
export async function sendEmailOtp(email: string): Promise<{ error: AuthError | null }> {
  const trimmedEmail = email.trim();

  if (isAuthDevBypassEnabled) {
    console.warn('[auth] Dev bypass: skipping signInWithOtp for', trimmedEmail);
    return { error: null };
  }

  authLog('signInWithOtp:request', { email: trimmedEmail });

  const { error } = await supabase.auth.signInWithOtp({
    email: trimmedEmail,
    options: { shouldCreateUser: true },
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
 * Marks onboarding as complete and writes any final profile fields in one upsert.
 */
export async function completeOnboarding(
  input: UpsertProfileInput = {},
): Promise<{ profile: UserProfile | null; error: AuthError | null }> {
  return upsertUserProfile({
    ...input,
    onboarding_completed: true,
    onboarding_status: 'onboarding_complete',
  });
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
