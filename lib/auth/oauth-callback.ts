// Pure interpretation of a returned Google OAuth callback URL.
//
// OWASP A07:2025 — Authentication Failures (CWE-294 capture-replay, CWE-384
// session fixation).
//
// Deliberately free of React Native / supabase imports so the security decision
// it encodes can be exercised directly in a Node unit test — see
// lib/auth/oauth-callback.test.ts. lib/auth/auth-service.ts performs the actual
// session exchange from the action this returns.

/**
 * Parses a Supabase OAuth callback URL. On PKCE the authorization code arrives
 * as a `code` query param; errors can appear in the query or the fragment, so
 * both parts are merged.
 */
export function parseOAuthCallbackParams(url: string): Record<string, string> {
  const params: Record<string, string> = {};
  const [beforeFragment, fragment] = url.split('#');
  const query = beforeFragment.split('?')[1];

  for (const part of [query, fragment]) {
    if (!part) continue;
    for (const pair of part.split('&')) {
      const [key, ...rest] = pair.split('=');
      if (!key) continue;
      try {
        params[decodeURIComponent(key)] = decodeURIComponent(rest.join('='));
      } catch {
        // Skip malformed pairs rather than failing the whole callback.
      }
    }
  }

  return params;
}

/**
 * The session-establishing action a returned OAuth callback URL maps to.
 *
 * `code` is the PKCE authorization code — the only success shape this client can
 * produce, because supabase-auth-options.ts pins `flowType: 'pkce'`. `error`
 * carries a provider/authorization error. `none` means the callback establishes
 * nothing.
 */
export type OAuthCallbackAction =
  | { kind: 'error'; message: string }
  | { kind: 'code'; code: string }
  | { kind: 'none' };

/**
 * Decides what a returned OAuth callback URL authorizes.
 *
 * This client only ever runs the PKCE flow (supabase-auth-options.ts pins
 * `flowType: 'pkce'`), so a completed sign-in comes back as a one-time `code`
 * bound to a verifier only this client holds. The implicit flow's shape —
 * `access_token`/`refresh_token` in the callback URL — is NEVER honoured: the
 * redirect lands on the app's custom scheme (hachisumobile://), which any app on
 * the device can claim, so tokens carried there are attacker-injectable. Turning
 * them into a session would be a fixation/replay vector (CWE-294, CWE-384), the
 * exact exposure PKCE exists to remove. Such a callback resolves to `none`.
 */
export function interpretOAuthCallback(url: string): OAuthCallbackAction {
  const params = parseOAuthCallbackParams(url);

  if (params.error_description || params.error) {
    return { kind: 'error', message: params.error_description || params.error };
  }
  if (params.code) {
    return { kind: 'code', code: params.code };
  }
  return { kind: 'none' };
}
