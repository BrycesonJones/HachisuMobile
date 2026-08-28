import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';

import { useAuth } from '@/contexts/auth-context';

// Local notification preferences (same AsyncStorage pattern as the active-store
// selection). These are UI preferences only for now: the app has no push
// notification infrastructure yet, so nothing reads them to gate delivery.
// Keyed per user so preferences don't bleed across accounts on one device.
const STORAGE_KEY_PREFIX = 'hachisu.notificationPrefs.';

export interface NotificationPreferences {
  payments: boolean;
  invoices: boolean;
  paymentRequests: boolean;
}

const DEFAULT_PREFERENCES: NotificationPreferences = {
  payments: true,
  invoices: true,
  paymentRequests: true,
};

export function useNotificationPreferences() {
  const { user } = useAuth();
  const storageKey = user ? `${STORAGE_KEY_PREFIX}${user.id}` : null;

  const [preferences, setPreferences] = useState<NotificationPreferences>(DEFAULT_PREFERENCES);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!storageKey) return;
    let cancelled = false;
    AsyncStorage.getItem(storageKey)
      .then((value) => {
        if (cancelled) return;
        if (value) {
          const parsed = JSON.parse(value) as Partial<NotificationPreferences>;
          setPreferences({ ...DEFAULT_PREFERENCES, ...parsed });
        }
        setLoaded(true);
      })
      .catch(() => {
        // Non-fatal: fall back to defaults for this session.
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [storageKey]);

  const setPreference = useCallback(
    (key: keyof NotificationPreferences, value: boolean) => {
      setPreferences((current) => {
        const next = { ...current, [key]: value };
        if (storageKey) {
          AsyncStorage.setItem(storageKey, JSON.stringify(next)).catch(() => {
            // Non-fatal: preference still applies for this session.
          });
        }
        return next;
      });
    },
    [storageKey],
  );

  return { preferences, loaded, setPreference };
}
