// Regression tests for delete-account failure classification and the shared
// close-account path.
//
// Live incident 2026-09-02: after the read-back bug made the first deletion
// attempt report failure (while actually deleting the account), retries ran
// with a session for a deleted identity and surfaced the Edge Function's raw
// "Not authenticated." — a dead-session condition presented as a deletion
// failure. Auth failures must become the truthful session-expired copy,
// server-crafted retry copy passes through, and nothing unrecognized may
// leak raw backend text.
//
// Run: npm run test:app

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import {
  classifyCloseAccountFailure,
  GENERIC_CLOSE_ACCOUNT_MESSAGE,
  SESSION_EXPIRED_MESSAGE,
} from './account-delete-errors.ts';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

test('the Edge Function 401 "Not authenticated." becomes the session-expired copy', () => {
  assert.deepEqual(classifyCloseAccountFailure(401, 'Not authenticated.'), {
    sessionExpired: true,
    message: SESSION_EXPIRED_MESSAGE,
  });
  // Even without a readable status, the literal text is recognized.
  assert.deepEqual(classifyCloseAccountFailure(undefined, 'Not authenticated.'), {
    sessionExpired: true,
    message: SESSION_EXPIRED_MESSAGE,
  });
});

test('platform-level auth rejections also map to session-expired', () => {
  for (const [status, detail] of [
    [401, undefined],
    [403, undefined],
    [401, 'Invalid JWT'],
    [401, 'Missing or invalid Authorization header.'],
  ] as const) {
    const result = classifyCloseAccountFailure(status, detail);
    assert.equal(result.sessionExpired, true, `${status}/${detail}`);
    assert.equal(result.message, SESSION_EXPIRED_MESSAGE);
  }
});

test('server-crafted retryable copy passes through as a deletion failure', () => {
  for (const detail of [
    'Could not close your account. Please try again.',
    'Could not remove your payment-processing stores. Your account was NOT deleted — please try again.',
  ]) {
    assert.deepEqual(classifyCloseAccountFailure(500, detail), {
      sessionExpired: false,
      message: detail,
    });
  }
});

test('unrecognized backend text never leaks — generic retry copy instead', () => {
  for (const detail of [
    'AuthApiError: something internal',
    'duplicate key value violates unique constraint "user_profiles_pkey"',
    '<html>502 Bad Gateway</html>',
    undefined,
    '',
  ]) {
    const result = classifyCloseAccountFailure(500, detail);
    assert.equal(result.sessionExpired, false);
    assert.equal(result.message, GENERIC_CLOSE_ACCOUNT_MESSAGE, String(detail));
  }
});

// ---------------------------------------------------------------------------
// Shared-path guards: Personal and Business use the same deletion flow, and
// the client validates the session before the destructive call.
// ---------------------------------------------------------------------------

function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

test('Personal and Business profile screens share the one close-account path', () => {
  for (const screen of ['app/account/personal-profile.tsx', 'app/account/business-profile.tsx']) {
    const source = withoutComments(readFileSync(join(repoRoot, screen), 'utf8'));
    assert.ok(
      source.includes('useCloseAccount'),
      `${screen} must use the shared useCloseAccount flow`,
    );
    assert.ok(
      !source.includes('account_type') && !source.includes('deleteAccount('),
      `${screen} must not branch deletion by account type or call the service directly`,
    );
  }
});

test('closeAccount validates the session server-side before the destructive call', () => {
  const source = withoutComments(readFileSync(join(repoRoot, 'contexts/auth-context.tsx'), 'utf8'));
  const closeAccountBody = source.slice(source.indexOf('const closeAccount'));
  assert.ok(
    closeAccountBody.includes('verifyAuthIdentity'),
    'closeAccount must pre-flight the session identity before invoking deletion',
  );
});

test('the deletion service classifies failures instead of surfacing raw text', () => {
  const source = withoutComments(readFileSync(join(repoRoot, 'lib/auth/auth-service.ts'), 'utf8'));
  const deleteBody = source.slice(source.indexOf('export async function deleteAccount'));
  assert.ok(
    deleteBody.includes('classifyCloseAccountFailure'),
    'deleteAccount must route every failure through classifyCloseAccountFailure',
  );
});
