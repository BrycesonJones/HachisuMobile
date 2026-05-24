import type { Session, User } from '@supabase/supabase-js';

import type { AccountType, OnboardingStatus, UserProfile } from '@/types/user-profile';

export const DEV_USER_ID = 'dev-user-id';

export interface DevUser extends User {
  isDevUser: true;
}

let activeDevSession: Session | null = null;
let activeDevProfile: UserProfile | null = null;

export function isDevAuthActive(): boolean {
  return activeDevSession != null;
}

export function getDevSession(): Session | null {
  return activeDevSession;
}

export function getDevProfile(): UserProfile | null {
  return activeDevProfile;
}

export function clearDevAuth(): void {
  activeDevSession = null;
  activeDevProfile = null;
}

function createDevUser(email: string, accountType?: AccountType): DevUser {
  const trimmedEmail = email.trim();
  const now = new Date().toISOString();

  return {
    id: DEV_USER_ID,
    email: trimmedEmail,
    app_metadata: {},
    user_metadata: {
      dev: true,
      accountType,
    },
    aud: 'authenticated',
    role: 'authenticated',
    created_at: now,
    isDevUser: true,
  } as DevUser;
}

export function createDevSession(email: string, accountType?: AccountType): Session {
  const user = createDevUser(email, accountType);
  const expiresAt = Math.floor(Date.now() / 1000) + 3600;

  return {
    access_token: 'dev-access-token',
    refresh_token: 'dev-refresh-token',
    expires_in: 3600,
    expires_at: expiresAt,
    token_type: 'bearer',
    user,
  } as Session;
}

export function createInitialDevProfile(
  email: string,
  accountType: AccountType,
  onboardingStatus: OnboardingStatus = 'email_verified',
): UserProfile {
  const now = new Date().toISOString();

  return {
    id: DEV_USER_ID,
    email: email.trim(),
    account_type: accountType,
    onboarding_status: onboardingStatus,
    username: null,
    created_at: now,
    updated_at: now,
  };
}

export function activateDevAuth(
  email: string,
  accountType: AccountType,
  onboardingStatus: OnboardingStatus = 'email_verified',
): { session: Session; profile: UserProfile } {
  const session = createDevSession(email, accountType);
  const profile = createInitialDevProfile(email, accountType, onboardingStatus);

  activeDevSession = session;
  activeDevProfile = profile;

  return { session, profile };
}

export function updateDevProfile(
  updates: Partial<Pick<UserProfile, 'username' | 'onboarding_status'>>,
): UserProfile | null {
  if (!activeDevProfile) {
    return null;
  }

  activeDevProfile = {
    ...activeDevProfile,
    ...updates,
    updated_at: new Date().toISOString(),
  };

  return activeDevProfile;
}
