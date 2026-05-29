import type { Href } from 'expo-router';

import type { AccountType, UserProfile } from '@/types/user-profile';

export const LANDING_ROUTE: Href = '/';
export const HOME_ROUTE: Href = '/(tabs)/home';
export const ACCOUNT_TYPE_ROUTE: Href = '/auth/choose-account-type';

function flowFor(accountType: AccountType | string | null | undefined): 'personal' | 'business' {
  return accountType === 'personal' ? 'personal' : 'business';
}

/**
 * Resolves the next route for an authenticated user based on their profile state.
 * Use after a confirmed Supabase session exists.
 */
export function resolvePostAuthRoute(profile: UserProfile | null): Href {
  if (!profile) {
    return ACCOUNT_TYPE_ROUTE;
  }

  if (profile.onboarding_completed) {
    return HOME_ROUTE;
  }

  const flow = flowFor(profile.account_type);

  switch (profile.onboarding_status) {
    case 'onboarding_complete':
      return HOME_ROUTE;
    case 'username_set':
      return { pathname: '/auth/push-notifications', params: flow === 'personal' ? { flow } : {} };
    case 'email_verified':
    case 'started':
    default:
      return { pathname: '/auth/choose-username', params: { flow } };
  }
}
