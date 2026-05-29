import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { getProfileDisplay } from '@/components/account/profile-display-utils';
import {
  ProfileMenuSheet,
  type ProfileMenuItemId,
} from '@/components/account/profile-menu-sheet';
import { DASHBOARD_COLORS } from '@/constants/dashboard-colors';
import { HachisuColors } from '@/constants/hachisu-colors';
import { useAuth } from '@/contexts/auth-context';
import type { AccountType } from '@/types/user-profile';

function resolveRoute(id: ProfileMenuItemId, accountType: AccountType | null): string {
  // TODO: replace stubs in app/account/* with real screens once they exist.
  switch (id) {
    case 'profile':
      return accountType === 'business'
        ? '/account/business-profile'
        : '/account/personal-profile';
    case 'payment-settings':
      return '/account/payment-settings';
    case 'wallet':
      return '/account/wallet';
    case 'documents':
      return '/account/documents';
    case 'api-keys':
      return '/account/api-keys';
  }
}

function toAccountType(value: string | null | undefined): AccountType | null {
  if (value === 'business' || value === 'personal') return value;
  return null;
}

export function AccountProfileHub() {
  const router = useRouter();
  const { profile, user, signOut } = useAuth();
  const [isOpen, setIsOpen] = useState(false);

  const display = useMemo(() => getProfileDisplay(profile, user), [profile, user]);
  const accountType = useMemo(() => toAccountType(profile?.account_type), [profile?.account_type]);
  const walletConnected = profile?.wallet_connected === true;

  function handleOpen() {
    setIsOpen(true);
  }

  function handleClose() {
    setIsOpen(false);
  }

  function handleSelect(itemId: ProfileMenuItemId) {
    setIsOpen(false);
    router.push(resolveRoute(itemId, accountType) as never);
  }

  async function handleLogout() {
    setIsOpen(false);
    await signOut();
    router.replace('/');
  }

  return (
    <>
      <Pressable
        onPress={handleOpen}
        style={({ pressed }) => [styles.trigger, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel="Open profile menu"
        accessibilityState={{ expanded: isOpen }}
        hitSlop={6}>
        <MaterialIcons
          name="person-outline"
          size={24}
          color={isOpen ? HachisuColors.primary : DASHBOARD_COLORS.primaryText}
        />
      </Pressable>

      <ProfileMenuSheet
        visible={isOpen}
        display={display}
        accountType={accountType}
        walletConnected={walletConnected}
        onClose={handleClose}
        onSelect={handleSelect}
        onLogout={handleLogout}
      />
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.6,
  },
});
