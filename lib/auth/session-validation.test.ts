// Regression tests for stale/deleted-session recovery at startup.
//
// Live incident 2026-09-02: after a successful server-side account deletion,
// a device still holding the locally persisted Supabase session restarted,
// getSession() restored the ghost session (the JWT stays cryptographically
// valid until expiry), the cascaded-away profile read back as "not found",
// and the router treated the ghost as an authenticated user who never
// onboarded — landing it on choose-account-type instead of the public page.
//
// The fix disambiguates a missing profile with an authoritative
// supabase.auth.getUser() server check, classified here. The classification
// must be generic (never keyed to a specific user), must purge only on an
// authoritative "identity/session no longer exists", and must NEVER purge
// because the check itself failed to run — a bad connection is not a
// sign-out.
//
// Run: npm run test:app

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import {
  classifyAuthIdentityCheck,
  shouldPurgeRestoredSession,
} from './session-validation.ts';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

test('a confirmed server-side user is valid', () => {
  assert.equal(
    classifyAuthIdentityCheck({ user: { id: 'u1' }, error: null }),
    'valid',
  );
});

test('authoritative deleted-identity answers are invalid', () => {
  // The shapes GoTrue/supabase-js produce for a deleted account, depending on
  // whether the cached access token is still live or a refresh was attempted.
  const invalidErrors = [
    { name: 'AuthApiError', message: 'User from sub claim in JWT does not exist', status: 403, code: 'user_not_found' },
    { name: 'AuthApiError', message: 'Session from session_id claim in JWT does not exist', status: 403, code: 'session_not_found' },
    { name: 'AuthApiError', message: 'Invalid Refresh Token: Refresh Token Not Found', status: 400, code: 'refresh_token_not_found' },
    { name: 'AuthApiError', message: 'Invalid Refresh Token: Already Used', status: 400, code: 'refresh_token_already_used' },
    { name: 'AuthApiError', message: 'invalid JWT', status: 401, code: 'bad_jwt' },
    { name: 'AuthApiError', message: 'unauthorized', status: 401 },
    { name: 'AuthApiError', message: 'forbidden', status: 403 },
    { name: 'AuthApiError', message: 'not found', status: 404 },
    { name: 'AuthSessionMissingError', message: 'Auth session missing!' },
  ];
  for (const error of invalidErrors) {
    assert.equal(
      classifyAuthIdentityCheck({ user: null, error }),
      'invalid',
      `${error.code ?? error.name ?? error.status} must be authoritative`,
    );
  }
});

test('a check that could not run is indeterminate — never a sign-out', () => {
  const transientErrors = [
    { name: 'AuthRetryableFetchError', message: 'fetch failed', status: 0 },
    { name: 'TypeError', message: 'Network request failed' },
    { name: 'AuthApiError', message: 'service unavailable', status: 503 },
    { name: 'AuthApiError', message: 'internal error', status: 500 },
    { name: 'SomeUnknownError', message: 'mystery' },
  ];
  for (const error of transientErrors) {
    assert.equal(
      classifyAuthIdentityCheck({ user: null, error }),
      'indeterminate',
      `${error.name}/${error.status} must not be treated as an invalid identity`,
    );
  }
});

test('a malformed no-error-no-user answer purges nothing', () => {
  assert.equal(classifyAuthIdentityCheck({ user: null, error: null }), 'indeterminate');
});

test('the purge decision requires BOTH a missing profile and an invalid verdict', () => {
  // E/J: deleted-user ghost session -> purge.
  assert.equal(shouldPurgeRestoredSession(false, 'invalid'), true);

  // D/H/I: identity confirmed, profile legitimately not created yet
  // (mid-signup, resumable onboarding) -> keep the session.
  assert.equal(shouldPurgeRestoredSession(false, 'valid'), false);

  // G: could not verify (network) -> keep the session, existing retry paths.
  assert.equal(shouldPurgeRestoredSession(false, 'indeterminate'), false);

  // A loaded profile proves the identity exists — no purge on any verdict.
  assert.equal(shouldPurgeRestoredSession(true, 'invalid'), false);
  assert.equal(shouldPurgeRestoredSession(true, 'valid'), false);
  assert.equal(shouldPurgeRestoredSession(true, 'indeterminate'), false);
});

// ---------------------------------------------------------------------------
// Wiring guards on the auth bootstrap.
// ---------------------------------------------------------------------------

function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

test('the auth bootstrap verifies a profileless restored session and can purge it', () => {
  const source = withoutComments(
    readFileSync(join(repoRoot, 'contexts/auth-context.tsx'), 'utf8'),
  );

  for (const required of [
    'verifyAuthIdentity',
    'shouldPurgeRestoredSession',
    'clearLocalAccountData',
    "signOut({ scope: 'local' })",
  ]) {
    assert.ok(
      source.includes(required),
      `auth-context.tsx must use ${required} in stale-session recovery`,
    );
  }
});

test('stale-session recovery is generic — no user is special-cased', () => {
  for (const file of ['contexts/auth-context.tsx', 'lib/auth/session-validation.ts']) {
    const source = readFileSync(join(repoRoot, file), 'utf8').toLowerCase();
    assert.ok(
      !source.includes('@gmail') && !source.includes('bc02ccf8'),
      `${file} must not special-case a specific account`,
    );
  }
});
