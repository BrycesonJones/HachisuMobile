import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { usePathname, useRouter } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet } from 'react-native';

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
  const pathname = usePathname();
  const { profile, user, signOut } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  // Route to navigate to once the sheet has finished dismissing. iOS cannot
  // present the account fullScreenModal while this RN Modal is still dismissing,
  // so we defer the push instead of firing it in the same tick as the close.
  const pendingRouteRef = useRef<string | null>(null);

  const navigatePending = useCallback(() => {
    const route = pendingRouteRef.current;
    if (!route) return;
    pendingRouteRef.current = null;
    router.push(route as never);
  }, [router]);

  const display = useMemo(() => getProfileDisplay(profile, user), [profile, user]);
  const accountType = useMemo(() => toAccountType(profile?.account_type), [profile?.account_type]);

  function handleOpen() {
    setIsOpen(true);
  }

  function handleClose() {
    setIsOpen(false);
  }

  function handleSelect(itemId: ProfileMenuItemId) {
    const route = resolveRoute(itemId, accountType);
    setIsOpen(false);

    // Already on the selected screen — just close the menu, don't push a
    // duplicate (the hub now lives on the store screens too).
    if (route === pathname) return;

    pendingRouteRef.current = route;

    if (Platform.OS === 'ios') {
      // Primary signal is the Modal's onDismiss; this timeout is a fallback in
      // case onDismiss doesn't fire. navigatePending is idempotent (clears the
      // ref), so whichever runs first wins and the other is a no-op.
      setTimeout(navigatePending, 400);
    } else {
      // Android Modal has no onDismiss and no present-while-dismissing limit.
      requestAnimationFrame(navigatePending);
    }
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
        onClose={handleClose}
        onSelect={handleSelect}
        onLogout={handleLogout}
        onDismiss={navigatePending}
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
