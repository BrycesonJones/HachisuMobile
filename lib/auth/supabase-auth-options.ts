// Cryptographic / session configuration for the Supabase auth client.
//
// Deliberately free of React Native imports (no AsyncStorage, no expo-*) so the
// behaviour these options produce — specifically the OAuth authorization request
// the client builds — can be exercised directly in a Node unit test. The storage
// adapter is supplied separately by lib/supabase.ts.
//
// See lib/auth/oauth-pkce.test.ts for the regression coverage.

export const supabaseAuthOptions = {
  // OWASP A04:2025 / CWE-325, CWE-523. supabase-js defaults to `implicit`, which
  // returns the ACCESS AND REFRESH TOKENS in the fragment of the redirect back to
  // this app's custom scheme (hachisumobile://). A custom scheme is claimable by
  // any other app on the device, so that redirect is an interceptable channel and
  // must never carry credentials. PKCE (RFC 7636, mandated for native apps by
  // RFC 8252 §8.1) instead returns a one-time authorization code that is useless
  // without the code verifier this client keeps to itself.
  //
  // Requires a CSPRNG and SHA-256 in the JS runtime — Hermes ships neither, so
  // lib/crypto/polyfill.ts must be loaded before this client is constructed.
  flowType: 'pkce',
  autoRefreshToken: true,
  persistSession: true,
  // Native deep links are handled explicitly in lib/auth/auth-service.ts; there
  // is no page URL for the client to inspect on its own.
  detectSessionInUrl: false,
} as const;
