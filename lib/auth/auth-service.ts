import { isAuthDevBypassEnabled } from '@/lib/auth/config';
import {
  activateDevAuth,
  clearDevAuth,
  getDevProfile,
  isDevAuthActive,
  updateDevProfile,
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

function toAuthError(error: { message: string }): AuthError {
  return { message: error.message };
}

/**
 * Sends a one-time passcode to the user's email.
 * In dev bypass mode, skips the network call so UI flows can be tested without email delivery.
 *
 * For real OTP testing later, disable dev bypass or configure Supabase email / disable
 * "Confirm email" in the Supabase Dashboard under Authentication settings.
 */
export async function sendEmailOtp(email: string): Promise<{ error: AuthError | null }> {
  const trimmedEmail = email.trim();

  if (isAuthDevBypassEnabled) {
    console.warn('[auth] Dev bypass: skipping signInWithOtp for', trimmedEmail);
    return { error: null };
  }

  // TODO: production — signInWithOtp
  const { error } = await supabase.auth.signInWithOtp({
    email: trimmedEmail,
    options: { shouldCreateUser: true },
  });

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

  // TODO: production — verifyOtp
  const { error } = await supabase.auth.verifyOtp({
    email: trimmedEmail,
    token,
    type: 'email',
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
  if (isAuthDevBypassEnabled && userId === 'dev-user-id') {
    return getDevProfile();
  }

  const { data, error } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function ensureUserProfile(
  input: EnsureUserProfileInput,
): Promise<{ profile: UserProfile | null; error: AuthError | null }> {
  if (isAuthDevBypassEnabled) {
  // TODO: In production, after verifyOtp succeeds, create/update user_profiles using the authenticated Supabase user id.
    const { profile } = activateDevAuth(
      input.email,
      input.accountType,
      input.onboardingStatus ?? 'email_verified',
    );
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

  if (existing) {
    const { data, error } = await supabase
      .from('user_profiles')
      .update({
        email: input.email.trim(),
        onboarding_status: input.onboardingStatus ?? existing.onboarding_status,
      })
      .eq('id', user.id)
      .select('*')
      .single();

    if (error) {
      return { profile: null, error: toAuthError(error) };
    }

    return { profile: data, error: null };
  }

  const { data, error } = await supabase
    .from('user_profiles')
    .insert({
      id: user.id,
      email: input.email.trim(),
      account_type: input.accountType,
      onboarding_status: input.onboardingStatus ?? 'email_verified',
    })
    .select('*')
    .single();

  if (error) {
    return { profile: null, error: toAuthError(error) };
  }

  return { profile: data, error: null };
}

export async function updateUserProfile(
  updates: Partial<Pick<UserProfile, 'username' | 'onboarding_status'>>,
): Promise<{ profile: UserProfile | null; error: AuthError | null }> {
  if (isAuthDevBypassEnabled && isDevAuthActive()) {
    const profile = updateDevProfile(updates);
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

  const { data, error } = await supabase
    .from('user_profiles')
    .update(updates)
    .eq('id', user.id)
    .select('*')
    .single();

  if (error) {
    return { profile: null, error: toAuthError(error) };
  }

  return { profile: data, error: null };
}
