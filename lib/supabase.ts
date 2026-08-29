// Must load before the Supabase client: @supabase/functions-js builds request
// URLs with `new URL(...)`, which Hermes only partially implements. Without this
// polyfill every functions.invoke() throws "Failed to send a request to the
// Edge Function". Imported here too (not only at the app entry) so it is always
// present before this module constructs/uses the client.
import 'react-native-url-polyfill/auto';

// Must also load before the Supabase client: Hermes ships no WebCrypto, and
// without it @supabase/auth-js generates the PKCE code verifier from
// Math.random() and downgrades the challenge to `plain`. See
// lib/crypto/web-crypto.ts.
import '@/lib/crypto/polyfill';

import { createClient } from '@supabase/supabase-js';

import { isAuthDevBypassEnabled, isProfileDebugEnabled } from '@/lib/auth/config';
import { sessionStorage } from '@/lib/auth/secure-session-storage';
import { supabaseAuthOptions } from '@/lib/auth/supabase-auth-options';
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

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    ...supabaseAuthOptions,
    storage: sessionStorage,
  },
});
