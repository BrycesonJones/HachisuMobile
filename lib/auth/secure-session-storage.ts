// Wires the Supabase session storage adapter to the device.
//
// Native: expo-secure-store, i.e. the iOS Keychain and the Android Keystore.
// Web: AsyncStorage, because no platform secure store exists there — the same
// split Supabase's own Expo guide uses.
//
// The keychain accessibility class is deliberate:
//   * AFTER_FIRST_UNLOCK matches the protection AsyncStorage already had on iOS,
//     so token refresh keeps working exactly as before.
//   * THIS_DEVICE_ONLY keeps the entry out of iCloud Keychain and out of any
//     backup restored onto a different device, which is the extraction path that
//     made unencrypted storage worth fixing in the first place.
//
// See lib/auth/session-storage.ts for the chunking, migration and fail-closed
// behaviour, and lib/auth/session-storage.test.ts for the regression coverage.

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { createSessionStorage, type KeyValueBackend } from '@/lib/auth/session-storage';

const secureStoreOptions: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

const asyncStorageBackend: KeyValueBackend = {
  getItem: (key) => AsyncStorage.getItem(key),
  setItem: (key, value) => AsyncStorage.setItem(key, value),
  removeItem: (key) => AsyncStorage.removeItem(key),
};

const secureStoreBackend: KeyValueBackend = {
  getItem: (key) => SecureStore.getItemAsync(key, secureStoreOptions),
  setItem: (key, value) => SecureStore.setItemAsync(key, value, secureStoreOptions),
  removeItem: (key) => SecureStore.deleteItemAsync(key, secureStoreOptions),
};

export const sessionStorage = createSessionStorage({
  secureStore: Platform.OS === 'web' ? null : secureStoreBackend,
  asyncStorage: asyncStorageBackend,
  // During a static web prerender there is no device storage to reach for.
  isPrerendering: () => typeof window === 'undefined',
});
