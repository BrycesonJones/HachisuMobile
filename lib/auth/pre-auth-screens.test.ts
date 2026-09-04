// Regression guard: pre-auth Personal onboarding screens must not perform
// authenticated Supabase work.
//
// The Personal signup flow runs BEFORE email/OTP authentication (email is
// verified last, exactly like business signup). Every screen ahead of the
// email-confirmation step therefore has no Supabase session, and any call that
// requires one — supabase.auth.getUser(), an authenticated table write, an
// Edge Function invoke — fails with AuthSessionMissingError ("Auth session
// missing!"), which then leaks to the user as a raw error string.
//
// This actually shipped: the country/legal-consent screen called
// upsertUserProfile() on Agree, which calls supabase.auth.getUser() and showed
// "Auth session missing!" to every brand-new user. Pre-auth answers must ride
// the flow as navigation params and be persisted only by the post-OTP
// finalization (finalizePersonalSignup).
//
// The test is a source-level invariant in the style of this repo's check:*
// guards: the pre-auth Personal screens may not reference any
// session-requiring API at all.
//
// Run: npm run test:app

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * Strips // and /* *\/ comments so documentation may name the forbidden APIs
 * (e.g. "persisted later by completeOnboarding") without tripping the guard —
 * only actual code references count.
 */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

/**
 * Screens a brand-new (unauthenticated) Personal user walks through before
 * the OTP step. None of them may touch a session-requiring API.
 */
const PRE_AUTH_PERSONAL_SCREENS = [
  'app/auth/personal-country.tsx',
  'app/auth/personal-phone.tsx',
  'app/auth/verify-personal.tsx',
];

/**
 * APIs that require an authenticated Supabase session (directly or via
 * supabase.auth.getUser()). Referencing any of these from a pre-auth screen
 * reintroduces the "Auth session missing!" defect.
 */
const SESSION_REQUIRING_APIS = [
  'upsertUserProfile',
  'updateUserProfile',
  'ensureUserProfile',
  'completeOnboarding',
  'recordCurrentLegalAcceptance',
  'hasCurrentLegalAcceptance',
  'fetchUserProfile',
  'deleteAccount',
  "from '@/lib/supabase'",
  'supabase.auth',
  'supabase.from',
  'supabase.functions',
];

for (const screen of PRE_AUTH_PERSONAL_SCREENS) {
  test(`${screen} performs no authenticated Supabase work pre-auth`, () => {
    const source = withoutComments(readFileSync(join(repoRoot, screen), 'utf8'));

    for (const api of SESSION_REQUIRING_APIS) {
      assert.ok(
        !source.includes(api),
        `${screen} references "${api}", which requires an authenticated ` +
          'Supabase session. This screen renders before email/OTP ' +
          'authentication, so the call fails with "Auth session missing!". ' +
          'Carry the value forward as navigation params and persist it in ' +
          'finalizePersonalSignup after the OTP succeeds.',
      );
    }
  });
}

// personal-verification-info is the last data-entry screen. Pre-auth it must
// only navigate onward (to the email/OTP screens); it may finalize directly
// only for an already-authenticated (resume) session, so it must gate on
// isAuthenticated rather than calling completeOnboarding unconditionally.
test('app/auth/personal-verification-info.tsx gates authenticated work on isAuthenticated', () => {
  const source = withoutComments(
    readFileSync(join(repoRoot, 'app/auth/personal-verification-info.tsx'), 'utf8'),
  );

  assert.ok(
    !source.includes('completeOnboarding'),
    'personal-verification-info.tsx calls completeOnboarding directly; ' +
      'pre-auth users have no session, so this fails with "Auth session ' +
      'missing!". Route to the email/OTP step and finalize afterwards.',
  );
  assert.ok(
    source.includes('isAuthenticated'),
    'personal-verification-info.tsx must check isAuthenticated before any ' +
      'session-requiring call (direct finalization is allowed only for an ' +
      'authenticated resume session).',
  );
});

// Hachisu does not collect Social Security numbers — the Privacy Notice
// states it outright ("We do not collect Social Security numbers"). The
// personal onboarding flow must therefore contain no SSN field, state,
// validation, carried param, or submit-payload entry.
test('personal onboarding collects no SSN data', () => {
  const personalFlowFiles = [
    ...PRE_AUTH_PERSONAL_SCREENS,
    'app/auth/personal-verification-info.tsx',
    'app/auth/personal-email.tsx',
    'app/auth/personal-email-confirmation.tsx',
    'lib/auth/personal-signup.ts',
    'utils/auth-validation.ts',
  ];

  for (const file of personalFlowFiles) {
    const source = withoutComments(readFileSync(join(repoRoot, file), 'utf8')).toLowerCase();
    assert.ok(
      !source.includes('ssn') && !source.includes('social security number'),
      `${file} references SSN — Hachisu must not collect Social Security ` +
        'numbers anywhere in personal onboarding (see the Privacy Notice).',
    );
  }
});

// The personal email screen is the single account-setup entry point: it sends
// the OTP and hands the carried pre-auth answers to the confirmation screen.
// (Google sign-up previously also lived here; the surface is gated off — see
// GOOGLE_AUTH_ENABLED and lib/auth/google-auth-gate.test.ts, which owns the
// invariant that no shipped screen may re-expose it.)
test('app/auth/personal-email.tsx offers first-party email/OTP sign-up', () => {
  const source = withoutComments(
    readFileSync(join(repoRoot, 'app/auth/personal-email.tsx'), 'utf8'),
  );

  assert.ok(
    source.includes('sendEmailOtp'),
    'personal-email.tsx must send the email OTP — it is the only account setup path',
  );

  // Account-type integrity: a personal signup must never route through
  // business finalization or carry the business account type.
  assert.ok(
    !source.includes('finalizeBusinessSignup') && !source.includes("'business'"),
    'personal-email.tsx must remain a personal signup — no business finalization or account type',
  );
  assert.ok(
    source.includes("accountType: 'personal'"),
    'the OTP hand-off must carry the personal account type explicitly',
  );

  // No pre-auth session work and no OTP after Google: OAuth initiation is the
  // only auth action here; OTP verification lives on the confirmation screen.
  for (const forbidden of [
    'verifyEmailOtp',
    'ensureUserProfile',
    'completeOnboarding',
    'upsertUserProfile',
    'supabase.auth',
    'supabase.from',
  ]) {
    assert.ok(
      !source.includes(forbidden),
      `personal-email.tsx must not call ${forbidden}`,
    );
  }

  // Onboarding state stays in route params for the OAuth round trip — no
  // persisted signup state that could go stale and contaminate later signups.
  for (const forbidden of ['AsyncStorage', 'SecureStore']) {
    assert.ok(
      !source.includes(forbidden),
      `personal-email.tsx must not persist onboarding state via ${forbidden}`,
    );
  }
});

// Business sign-up guard: the business flow keeps its own email/OTP wiring,
// with finalization on the confirmation screen (where the session exists).
test('business sign-up keeps its own email/OTP + finalization wiring', () => {
  const businessEmail = withoutComments(
    readFileSync(join(repoRoot, 'app/auth/business-email.tsx'), 'utf8'),
  );
  const businessConfirmation = withoutComments(
    readFileSync(join(repoRoot, 'app/auth/business-confirmation.tsx'), 'utf8'),
  );

  assert.ok(
    businessEmail.includes('sendEmailOtp'),
    'business-email.tsx must send the email OTP — it is the only account setup path',
  );
  assert.ok(
    businessEmail.includes("accountType: 'business'"),
    'the OTP hand-off must carry the business account type explicitly',
  );
  assert.ok(
    !businessEmail.includes('finalizePersonalSignup'),
    'business-email.tsx must remain a business signup — no personal finalization',
  );
  assert.ok(
    businessConfirmation.includes('finalizeBusinessSignup'),
    'business-confirmation.tsx must keep finalizing via finalizeBusinessSignup',
  );
});

// The email/OTP confirmation screen is where the Personal flow authenticates.
// It must exist in the flow and hand the carried answers to the single
// idempotent finalization point rather than writing the profile piecemeal.
test('app/auth/personal-email-confirmation.tsx finalizes via finalizePersonalSignup', () => {
  const source = withoutComments(
    readFileSync(join(repoRoot, 'app/auth/personal-email-confirmation.tsx'), 'utf8'),
  );

  assert.ok(
    source.includes('finalizePersonalSignup'),
    'personal-email-confirmation.tsx must commit the carried onboarding ' +
      'answers through finalizePersonalSignup after the OTP succeeds.',
  );

  // The OTP path verifies the emailed code — nothing else: no Google logic,
  // no business finalization, no re-sending of codes from this screen.
  assert.ok(
    source.includes('verifyEmailOtp'),
    'the confirmation screen must verify the emailed code via verifyEmailOtp',
  );
  for (const forbidden of [
    'signInWithGoogleOAuth',
    'GoogleSignInButton',
    'finalizeBusinessSignup',
    'sendEmailOtp',
  ]) {
    assert.ok(
      !source.includes(forbidden),
      `personal-email-confirmation.tsx must not reference ${forbidden}`,
    );
  }

  // Retry safety: a session established by a previous attempt must retry the
  // commit instead of re-verifying the single-use code.
  assert.ok(
    source.includes('isAuthenticated'),
    'the confirmation screen must retry finalization when already authenticated',
  );

  // Verification failures must be mapped to friendly copy, never rendered raw.
  assert.ok(
    source.includes('friendlyOtpErrorMessage'),
    'OTP verification errors must go through friendlyOtpErrorMessage before display',
  );
});
