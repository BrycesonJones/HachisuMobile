import AsyncStorage from '@react-native-async-storage/async-storage';

import { clearAllActivityCache } from '@/lib/btcpay/activity-cache';
import { clearAllPaymentRequestCache } from '@/lib/btcpay/payment-request-cache';

// 'hachisu.' covers app preferences (active store selection, notification
// prefs). 'sb-' is the Supabase auth session key prefix — signOut removes it
// too, but purging it here guarantees a deleted account's session can never be
// restored on relaunch even if that sign-out was interrupted.
const LOCAL_KEY_PREFIXES = ['hachisu.', 'sb-'];

/**
 * Purges every piece of user/store data this app keeps on the device: the
 * in-memory invoice and payment-request caches plus all Hachisu and Supabase
 * AsyncStorage keys. Used after a permanent account deletion, where any
 * surviving local record would describe an account that no longer exists.
 */
export async function clearLocalAccountData(): Promise<void> {
  clearAllActivityCache();
  clearAllPaymentRequestCache();

  try {
    const keys = await AsyncStorage.getAllKeys();
    const toRemove = keys.filter((key) =>
      LOCAL_KEY_PREFIXES.some((prefix) => key.startsWith(prefix)),
    );
    if (toRemove.length > 0) {
      await AsyncStorage.multiRemove(toRemove);
    }
  } catch {
    // Best-effort: the server account is already gone and the in-memory state
    // is cleared; leftover storage keys only hold ids for a deleted account.
  }
}
