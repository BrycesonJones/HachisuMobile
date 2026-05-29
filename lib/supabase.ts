import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

import { isAuthDevBypassEnabled, isProfileDebugEnabled } from '@/lib/auth/config';
import type { Database } from '@/types/supabase';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY. Check your .env file.',
  );
}

if (__DEV__) {
  console.log('[auth-mode]', {
    devBypass: process.env.EXPO_PUBLIC_AUTH_DEV_BYPASS,
    mode: isAuthDevBypassEnabled
      ? 'LOCAL_DEV_BYPASS_NO_SUPABASE_WRITES'
      : 'REAL_SUPABASE_AUTH',
  });
}

if (isProfileDebugEnabled) {
  console.log('[supabase-runtime]', {
    url: supabaseUrl,
    authDevBypass: isAuthDevBypassEnabled,
    profileDebug: isProfileDebugEnabled,
  });
}

const ssrSafeStorage = {
  getItem: (key: string) => {
    if (typeof window === 'undefined') {
      return Promise.resolve(null);
    }

    return AsyncStorage.getItem(key);
  },
  setItem: (key: string, value: string) => {
    if (typeof window === 'undefined') {
      return Promise.resolve();
    }

    return AsyncStorage.setItem(key, value);
  },
  removeItem: (key: string) => {
    if (typeof window === 'undefined') {
      return Promise.resolve();
    }

    return AsyncStorage.removeItem(key);
  },
};

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: ssrSafeStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
