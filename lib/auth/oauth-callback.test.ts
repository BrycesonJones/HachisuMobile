// Regression tests for how the Google OAuth callback URL is honoured.
//
// OWASP A07:2025 — Authentication Failures (CWE-294 authentication bypass by
// capture-replay, CWE-384 session fixation).
//
// Hachisu signs in with Google through a system browser that redirects back to
// the app's custom scheme (hachisumobile://). That scheme is claimable by any
// other app on the device, so the callback URL is an interceptable channel.
// supabase-auth-options.ts pins `flowType: 'pkce'`, so a completed sign-in comes
// back as a one-time `code` bound to a verifier only this client holds — useless
// to an interceptor.
//
// The implicit flow's shape is different: it delivers the ACCESS AND REFRESH
// TOKENS themselves in the callback URL. Honouring those tokens from a
// custom-scheme deep link would let anything on the device hand this app a
// session of the attacker's choosing (fixation), or replay a captured one — the
// precise exposure PKCE exists to remove. The callback interpreter must
// therefore NEVER establish a session from URL-delivered tokens.
//
// Run: npm run test:app

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { interpretOAuthCallback } from './oauth-callback.ts';

const REDIRECT = 'hachisumobile://';

test('a PKCE code callback is honoured as a code exchange', () => {
  const action = interpretOAuthCallback(`${REDIRECT}?code=abc123`);
  assert.deepEqual(action, { kind: 'code', code: 'abc123' });
});

test('an authorization error is surfaced', () => {
  const action = interpretOAuthCallback(
    `${REDIRECT}?error=access_denied&error_description=User%20denied`,
  );
  assert.equal(action.kind, 'error');
});

test('access/refresh tokens in the callback URL never establish a session (query form)', () => {
  const action = interpretOAuthCallback(
    `${REDIRECT}?access_token=ATTACKER_ACCESS&refresh_token=ATTACKER_REFRESH&token_type=bearer`,
  );
  // The interceptable custom-scheme redirect must not be able to inject a
  // session. Anything other than an inert outcome is a fixation/replay vector.
  assert.notEqual(
    action.kind,
    'tokens',
    'the callback interpreter accepted access/refresh tokens delivered in the ' +
      'redirect URL — a custom-scheme interceptor could fixate or replay a session',
  );
  assert.equal(action.kind, 'none');
});

test('access/refresh tokens in the callback URL fragment never establish a session', () => {
  const action = interpretOAuthCallback(
    `${REDIRECT}#access_token=ATTACKER_ACCESS&refresh_token=ATTACKER_REFRESH&token_type=bearer`,
  );
  assert.notEqual(action.kind, 'tokens');
  assert.equal(action.kind, 'none');
});

test('a code still wins even if tokens are also present (no downgrade to token handling)', () => {
  const action = interpretOAuthCallback(
    `${REDIRECT}?code=good_code#access_token=ATTACKER&refresh_token=ATTACKER`,
  );
  assert.deepEqual(action, { kind: 'code', code: 'good_code' });
});
