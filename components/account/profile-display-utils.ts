import type { User } from '@supabase/supabase-js';

import type { UserProfile } from '@/types/user-profile';

export interface ProfileDisplay {
  displayName: string;
  subtitle: string;
  accountTypeLabel: string | null;
}

export function getProfileDisplay(
  profile: UserProfile | null,
  user: User | null,
): ProfileDisplay {
  const metadataName =
    typeof user?.user_metadata?.full_name === 'string'
      ? (user.user_metadata.full_name as string)
      : undefined;

  const isBusiness = profile?.account_type === 'business';
  const primaryName = isBusiness
    ? profile?.business_name?.trim() || profile?.full_name?.trim()
    : profile?.full_name?.trim();

  const displayName =
    primaryName ||
    profile?.username?.trim() ||
    metadataName?.trim() ||
    'Account';
  const subtitle = profile?.email?.trim() || user?.email?.trim() || '';

  return {
    displayName,
    subtitle,
    accountTypeLabel: getAccountTypeLabel(profile?.account_type),
  };
}

function getAccountTypeLabel(accountType: string | null | undefined): string | null {
  if (accountType === 'business') return 'Business';
  if (accountType === 'personal') return 'Personal';
  return null;
}
