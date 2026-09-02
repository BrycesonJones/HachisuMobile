import { useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Alert } from 'react-native';

import { useAuth } from '@/contexts/auth-context';

/**
 * Shared Close Account flow for the profile screens: destructive confirmation,
 * double-submit guard, permanent server-side deletion via AuthContext, and the
 * exit back to the unauthenticated landing screen on success. On failure the
 * account and session are untouched and the user can retry from the same
 * button.
 */
export function useCloseAccount() {
  const router = useRouter();
  const { closeAccount } = useAuth();
  const [isClosingAccount, setIsClosingAccount] = useState(false);
  // Ref (not state) is the submit guard: the Alert callback captures a stale
  // render, so state alone cannot prevent a double confirmation.
  const inFlightRef = useRef(false);

  const runCloseAccount = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setIsClosingAccount(true);

    const { error, sessionExpired } = await closeAccount();

    if (error) {
      inFlightRef.current = false;
      setIsClosingAccount(false);
      if (sessionExpired) {
        // The session is dead (already purged by closeAccount) — nothing to
        // retry here. Tell the user, then leave the authenticated UI.
        Alert.alert('Session expired', error, [
          { text: 'OK', onPress: () => router.replace('/') },
        ]);
        return;
      }
      Alert.alert('Could not close account', error);
      return;
    }

    // Keep the loading state on while the navigator replaces this screen —
    // the account is gone, so the button must never look tappable again.
    router.replace('/');
  }, [closeAccount, router]);

  const confirmCloseAccount = useCallback(() => {
    if (inFlightRef.current) return;
    Alert.alert(
      'Close account?',
      'Your Hachisu account, app data, and the payment-processing stores Hachisu set up for you will be permanently deleted, and no new invoices can be created. Export any reports you need first. Bitcoin in your own wallet is not affected. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Close Account', style: 'destructive', onPress: () => void runCloseAccount() },
      ],
    );
  }, [runCloseAccount]);

  return { isClosingAccount, confirmCloseAccount };
}
