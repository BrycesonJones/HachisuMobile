import type { Tables } from '@/types/supabase';

export type AccountType = 'personal' | 'business';

export type OnboardingStatus =
  | 'started'
  | 'email_verified'
  | 'username_set'
  | 'onboarding_complete';

export type UserProfile = Tables<'user_profiles'>;
