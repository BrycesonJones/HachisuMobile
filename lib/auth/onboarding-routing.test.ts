// Regression tests for the post-auth routing table.
//
// resolvePostAuthRoute runs only after a CONFIRMED-valid authenticated
// session (stale/deleted sessions are purged by the startup check in
// contexts/auth-context.tsx before routing — see session-validation.test.ts).
// Within that contract, the table below is the intended behavior, pinned so
// the stale-session fix cannot drift it: an authenticated user with no
// profile row is a legitimate fresh signup (OTP or Google verified moments
// before finalization) and still belongs at choose-account-type.
//
// Run: npm run test:app

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { resolvePostAuthRoute } from './onboarding-routing.ts';

type Profile = Parameters<typeof resolvePostAuthRoute>[0];

function profile(overrides: Record<string, unknown>): Profile {
  return overrides as unknown as Profile;
}

test('no profile row (fresh signup pre-finalization) resumes at account-type selection', () => {
  assert.deepEqual(resolvePostAuthRoute(null), '/auth/choose-account-type');
});

test('a completed personal account lands on the dashboard', () => {
  assert.deepEqual(
    resolvePostAuthRoute(profile({ account_type: 'personal', onboarding_completed: true })),
    '/(tabs)/home',
  );
});

test('a completed business account lands on the dashboard', () => {
  assert.deepEqual(
    resolvePostAuthRoute(profile({ account_type: 'business', onboarding_completed: true })),
    '/(tabs)/home',
  );
});

test('incomplete personal onboarding resumes at the right step', () => {
  assert.deepEqual(
    resolvePostAuthRoute(
      profile({ account_type: 'personal', onboarding_status: 'username_set' }),
    ),
    { pathname: '/auth/personal-country', params: { flow: 'personal' } },
  );
  assert.deepEqual(
    resolvePostAuthRoute(
      profile({ account_type: 'personal', onboarding_status: 'email_verified' }),
    ),
    { pathname: '/auth/choose-username', params: { flow: 'personal' } },
  );
});

test('incomplete business onboarding resumes at the right step', () => {
  assert.deepEqual(
    resolvePostAuthRoute(
      profile({ account_type: 'business', onboarding_status: 'username_set' }),
    ),
    { pathname: '/auth/verify-business' },
  );
  assert.deepEqual(
    resolvePostAuthRoute(
      profile({ account_type: 'business', onboarding_status: 'email_verified' }),
    ),
    { pathname: '/auth/choose-username', params: { flow: 'business' } },
  );
});
