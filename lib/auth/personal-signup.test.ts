// Regression tests for the personal sign-up finalization decision.
//
// Personal sign-up is email-LAST: the country/legal screen, phone screen, and
// verification-info screen all run with no Supabase session, carrying their
// answers as route params. finalizePersonalSignup (auth-service.ts) runs once
// the OTP has authenticated the user and delegates the commit/resume decision
// to decidePersonalFinalization, tested here.
//
// The defect this guards against: the country/legal screen used to write the
// profile directly on Agree, which pre-auth failed with "Auth session
// missing!". The country (and the Agree tap) must instead ride the params and
// be committed exactly once, idempotently, after authentication.
//
// Run: npm run test:app

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  decidePersonalFinalization,
  friendlyOtpErrorMessage,
  LEGAL_AGREED,
} from './personal-signup.ts';

const FULL_PARAMS = {
  username: 'satoshi',
  country: 'United States',
  phone: '201-555-0123',
  full_name: 'Satoshi Nakamoto',
  personal_address: '123 Main Street, Atlanta, GA 30301',
  legal: LEGAL_AGREED,
};

test('a fresh signup with every carried answer completes with the selected country', () => {
  // First finalization: the OTP just succeeded, no profile row existed before
  // ensureUserProfile created it (so none of the answer columns are set).
  const decision = decidePersonalFinalization(
    { onboarding_completed: false },
    FULL_PARAMS,
  );

  assert.equal(decision.kind, 'complete');
  assert.deepEqual(decision.kind === 'complete' && decision.answers, {
    username: 'satoshi',
    country: 'United States',
    phone: '201-555-0123',
    full_name: 'Satoshi Nakamoto',
    personal_address: '123 Main Street, Atlanta, GA 30301',
  });
});

test('a null profile row (ensure raced/failed to return one) still completes from params', () => {
  const decision = decidePersonalFinalization(null, FULL_PARAMS);
  assert.equal(decision.kind, 'complete');
});

test('carried answers are trimmed before persisting', () => {
  const decision = decidePersonalFinalization(null, {
    ...FULL_PARAMS,
    username: '  satoshi  ',
    country: '  United States ',
  });

  assert.equal(decision.kind, 'complete');
  if (decision.kind === 'complete') {
    assert.equal(decision.answers.username, 'satoshi');
    assert.equal(decision.answers.country, 'United States');
  }
});

test('retrying after a successful finalization never rewrites the account (idempotency)', () => {
  // Second tap / re-entered flow: the profile now reports completion. The
  // decision must be already_complete so finalization resumes by profile
  // state instead of re-running completeOnboarding and re-provisioning.
  const decision = decidePersonalFinalization(
    { onboarding_completed: true },
    FULL_PARAMS,
  );

  assert.deepEqual(decision, { kind: 'already_complete' });
});

test('an already-completed account is protected even when carried answers differ', () => {
  const decision = decidePersonalFinalization(
    { onboarding_completed: true, username: 'existing', country: 'Japan' },
    { ...FULL_PARAMS, username: 'attacker-chosen', country: 'Elsewhere' },
  );

  assert.deepEqual(decision, { kind: 'already_complete' });
});

test('missing legal agreement never completes onboarding (consent is not silently granted)', () => {
  // The Agree tap on the country/legal screen is the only source of this
  // flag. Without it — a stale deep link, a flow entered sideways — the
  // finalization must resume onboarding, NOT record acceptance.
  const { legal: _legal, ...withoutLegal } = FULL_PARAMS;
  const decision = decidePersonalFinalization({ onboarding_completed: false }, withoutLegal);
  assert.deepEqual(decision, { kind: 'incomplete' });
});

test('a legal value other than the agreed sentinel does not complete onboarding', () => {
  const decision = decidePersonalFinalization(
    { onboarding_completed: false },
    { ...FULL_PARAMS, legal: 'true' },
  );
  assert.deepEqual(decision, { kind: 'incomplete' });
});

test('the profile can never substitute for the explicit Agree tap', () => {
  // Even a profile with every answer column filled must not complete without
  // the carried legal flag from this flow's Agree tap.
  const { legal: _legal, ...withoutLegal } = FULL_PARAMS;
  const decision = decidePersonalFinalization(
    {
      onboarding_completed: false,
      username: 'satoshi',
      country: 'United States',
      phone: '201-555-0123',
      full_name: 'Satoshi Nakamoto',
      personal_address: '123 Main Street, Atlanta, GA 30301',
    },
    withoutLegal,
  );
  assert.deepEqual(decision, { kind: 'incomplete' });
});

test('each of the 8 launch countries finalizes and persists its full canonical name', () => {
  const launchCountries = [
    'United States',
    'Canada',
    'United Kingdom',
    'Australia',
    'New Zealand',
    'Ireland',
    'Singapore',
    'Hong Kong',
  ];

  for (const name of launchCountries) {
    const decision = decidePersonalFinalization(
      { onboarding_completed: false },
      { ...FULL_PARAMS, country: name },
    );

    assert.equal(decision.kind, 'complete', `${name} must finalize`);
    if (decision.kind === 'complete') {
      assert.equal(
        decision.answers.country,
        name,
        `${name} must be stored as its full name, unmodified`,
      );
    }
  }
});

test('an ISO code carried as the country never reaches the profile', () => {
  for (const code of ['US', 'CA', 'GB', 'AU', 'NZ', 'IE', 'SG', 'HK']) {
    const decision = decidePersonalFinalization(
      { onboarding_completed: false },
      { ...FULL_PARAMS, country: code },
    );
    assert.deepEqual(
      decision,
      { kind: 'incomplete' },
      `ISO code "${code}" must resume onboarding, not be persisted as the country`,
    );
  }
});

test('an unsupported country in the carried params resumes instead of persisting', () => {
  // The selector cannot produce this, so it can only arrive via a tampered or
  // stale route param — finalization must send the user back through
  // onboarding rather than store an off-list value.
  const decision = decidePersonalFinalization(
    { onboarding_completed: false },
    { ...FULL_PARAMS, country: 'France' },
  );
  assert.deepEqual(decision, { kind: 'incomplete' });
});

test('an existing profile country of "United States" still finalizes via fallback', () => {
  // Existing-user compatibility: a resume whose country was persisted before
  // the launch-list change (always "United States") keeps working with no
  // migration and no forced re-selection.
  const { country: _country, ...paramsWithoutCountry } = FULL_PARAMS;
  const decision = decidePersonalFinalization(
    { onboarding_completed: false, country: 'United States' },
    paramsWithoutCountry,
  );

  assert.equal(decision.kind, 'complete');
  if (decision.kind === 'complete') {
    assert.equal(decision.answers.country, 'United States');
  }
});

test('a missing country resumes onboarding instead of completing with holes', () => {
  const { country: _country, ...withoutCountry } = FULL_PARAMS;
  const decision = decidePersonalFinalization(
    { onboarding_completed: false },
    withoutCountry,
  );
  assert.deepEqual(decision, { kind: 'incomplete' });
});

test('every other missing required answer also resumes instead of completing', () => {
  for (const key of ['username', 'phone', 'full_name', 'personal_address'] as const) {
    const params = { ...FULL_PARAMS, [key]: '   ' };
    const decision = decidePersonalFinalization({ onboarding_completed: false }, params);
    assert.deepEqual(
      decision,
      { kind: 'incomplete' },
      `finalization completed despite missing ${key}`,
    );
  }
});

test('an authenticated resume falls back to answers already on the profile', () => {
  // A user whose username was persisted by the authenticated choose-username
  // path resumes at the country screen; the username is on the profile, not
  // in the params. Finalization must merge the two.
  const { username: _username, ...paramsWithoutUsername } = FULL_PARAMS;
  const decision = decidePersonalFinalization(
    { onboarding_completed: false, username: 'persisted-name' },
    paramsWithoutUsername,
  );

  assert.equal(decision.kind, 'complete');
  if (decision.kind === 'complete') {
    assert.equal(decision.answers.username, 'persisted-name');
    assert.equal(decision.answers.country, 'United States');
  }
});

test('an E.164 phone carried from the country-aware phone screen persists unchanged', () => {
  // The phone screen normalizes input to +<calling code><national> before
  // carrying it forward; finalization must pass it through verbatim next to
  // the full canonical country name.
  const decision = decidePersonalFinalization(
    { onboarding_completed: false },
    { ...FULL_PARAMS, country: 'Canada', phone: '+14165550123' },
  );

  assert.equal(decision.kind, 'complete');
  if (decision.kind === 'complete') {
    assert.equal(decision.answers.phone, '+14165550123');
    assert.equal(decision.answers.country, 'Canada');
  }
});

test('raw Supabase OTP errors map to friendly copy and are never echoed', () => {
  // Incorrect, expired, and reused codes all come back from Supabase as the
  // same message; the remedy shown must be actionable, not the raw string.
  const rawCases = [
    'Token has expired or is invalid',
    'Otp has expired or is invalid',
    'Email rate limit exceeded',
    'For security purposes, you can only request this after 60 seconds (too many requests)',
    'Auth session missing!',
    'TypeError: Network request failed',
    'Failed to fetch',
    'some completely unexpected provider error XYZZY-42',
  ];

  for (const raw of rawCases) {
    const friendly = friendlyOtpErrorMessage(raw);
    assert.ok(friendly.length > 0, 'a message is always produced');
    assert.ok(
      !friendly.toLowerCase().includes('token') &&
        !friendly.toLowerCase().includes('supabase') &&
        !friendly.includes('XYZZY-42') &&
        !friendly.includes('Auth session missing'),
      `raw provider text leaked through for: ${raw} -> ${friendly}`,
    );
  }
});

test('expired/invalid codes and rate limits get distinct actionable guidance', () => {
  assert.match(
    friendlyOtpErrorMessage('Token has expired or is invalid'),
    /didn’t work|expired/i,
  );
  assert.match(friendlyOtpErrorMessage('Email rate limit exceeded'), /wait/i);
  assert.match(friendlyOtpErrorMessage('Failed to fetch'), /connection/i);
  assert.match(
    friendlyOtpErrorMessage('Auth session missing!'),
    /request a new code/i,
  );
});

test('carried params win over stale profile values', () => {
  const decision = decidePersonalFinalization(
    { onboarding_completed: false, country: 'Old Country', phone: '000' },
    FULL_PARAMS,
  );

  assert.equal(decision.kind, 'complete');
  if (decision.kind === 'complete') {
    assert.equal(decision.answers.country, 'United States');
    assert.equal(decision.answers.phone, '201-555-0123');
  }
});
