// Account sheet menu rows, extracted from profile-menu-sheet.tsx so the
// order/labels are testable under node --test (type-only imports keep this
// module free of React Native at runtime).

import type MaterialIcons from '@expo/vector-icons/MaterialIcons';

import type { AccountType } from '@/types/user-profile';

export type ProfileMenuItemId =
  | 'feedback'
  | 'profile'
  | 'app-notifications'
  | 'documents';

export interface ProfileMenuItem {
  id: ProfileMenuItemId;
  label: string;
  icon: keyof typeof MaterialIcons.glyphMap;
  tag?: string;
}

export function buildMenuItems(
  accountType: AccountType | null,
): readonly ProfileMenuItem[] {
  const profileItem: ProfileMenuItem =
    accountType === 'business'
      ? { id: 'profile', label: 'Business Profile', icon: 'person-outline' }
      : { id: 'profile', label: 'Personal Profile', icon: 'person-outline' };

  return [
    // Feedback sits above the profile row for both account types.
    { id: 'feedback', label: 'Feedback', icon: 'chat-bubble-outline' },
    profileItem,
    { id: 'app-notifications', label: 'App Notifications', icon: 'notifications-none' },
    { id: 'documents', label: 'Documents', icon: 'description' },
  ];
}
