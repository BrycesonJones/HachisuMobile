// Pure decision logic for finalizing Personal sign-up.
//
// Personal sign-up authenticates LAST (mirroring business sign-up): the
// username, country, phone, and verification answers are collected while the
// user has no Supabase session and ride the flow as navigation params. Only
// after the email OTP succeeds does finalizePersonalSignup (auth-service.ts)
// persist anything. This module decides — from the carried params and the
// just-ensured profile row — whether that finalization may complete
// onboarding, must resume it, or must leave an already-finished account
// untouched.
//
// Deliberately free of React Native / supabase imports so the decision can be
// exercised directly in a Node unit test — see lib/auth/personal-signup.test.ts.
// (The explicit .ts extension below keeps the module loadable by node --test.)

import { isSupportedCountry } from '../../constants/supported-countries.ts';

/** The pre-auth personal signup answers carried through the flow as route params. */
export interface PersonalSignupParams {
  username?: string;
  country?: string;
  phone?: string;
  full_name?: string;
  personal_address?: string;
  /**
   * Set to 'agreed' by the country screen when the user taps Agree under the
   * legal disclosure. Carried as pending state only — the authoritative
   * versioned acceptance record is written server-side by completeOnboarding
   * once a session exists. Finalization refuses to complete without it, so
   * consent is never marked accepted for a user who skipped the Agree gate.
   */
  legal?: string;
}

/** The subset of the profile row this decision reads (structural, not the DB type). */
export interface PersonalProfileSnapshot {
  onboarding_completed?: boolean | null;
  username?: string | null;
  country?: string | null;
  phone?: string | null;
  full_name?: string | null;
  personal_address?: string | null;
}

export const LEGAL_AGREED = 'agreed';

/**
 * Maps a raw Supabase OTP-verification failure to friendly, actionable copy.
 * Raw provider messages ("Token has expired or is invalid", rate-limit text,
 * fetch failures, "Auth session missing!") must never reach the screen; the
 * fallback is deliberately generic so an unrecognized provider message can't
 * leak through either. Incorrect, expired, and reused codes all surface the
 * same guidance because Supabase reports them identically and the remedy is
 * the same: re-check the latest email or request a fresh code.
 */
export function friendlyOtpErrorMessage(rawMessage: string): string {
  const raw = rawMessage.toLowerCase();

  if (raw.includes('rate limit') || raw.includes('too many')) {
    return 'Too many attempts. Please wait a minute and try again.';
  }
  if (raw.includes('auth session missing') || raw.includes('no authenticated user')) {
    return 'Your sign-in session was interrupted. Please request a new code and try again.';
  }
  if (
    raw.includes('expired') ||
    raw.includes('invalid') ||
    raw.includes('not found') ||
    raw.includes('incorrect')
  ) {
    return 'That code didn’t work. It may have expired — check the latest email, or go back to request a new code.';
  }
  if (raw.includes('network') || raw.includes('fetch') || raw.includes('timeout')) {
    return 'We couldn’t reach the server. Check your connection and try again.';
  }
  return 'We couldn’t verify that code. Please try again.';
}

export interface PersonalSignupAnswers {
  username: string;
  country: string;
  phone: string;
  full_name: string;
  personal_address: string;
}

export type PersonalFinalizationDecision =
  /** Account already finished onboarding: never overwrite, never re-provision. */
  | { kind: 'already_complete' }
  /** Answers missing (stale link, interrupted flow): resume by profile state. */
  | { kind: 'incomplete' }
  /** All answers present and the Agree gate was passed: safe to complete. */
  | { kind: 'complete'; answers: PersonalSignupAnswers };

function nonEmpty(value: string | null | undefined): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

/**
 * Decides how a personal signup finalization proceeds.
 *
 * Answers fall back from the carried params to the existing profile row so an
 * authenticated resume (e.g. a user whose username was already persisted by
 * the authenticated choose-username path) can still finalize, while a flow
 * reached with holes in it resumes onboarding instead of completing with
 * missing data.
 *
 * Idempotent by construction: a retried finalization after success sees
 * onboarding_completed on the profile and returns 'already_complete', so the
 * account is never overwritten and provisioning never re-runs.
 */
export function decidePersonalFinalization(
  profile: PersonalProfileSnapshot | null,
  params: PersonalSignupParams,
): PersonalFinalizationDecision {
  if (profile?.onboarding_completed) {
    return { kind: 'already_complete' };
  }

  const username = nonEmpty(params.username) ?? nonEmpty(profile?.username);
  // The country selector only offers the launch countries, and the stored
  // value must stay one of those full canonical names — a carried value from
  // outside that list (a tampered or stale route param) resumes onboarding at
  // the country screen instead of being persisted.
  const carriedCountry = nonEmpty(params.country) ?? nonEmpty(profile?.country);
  const country = isSupportedCountry(carriedCountry) ? carriedCountry : null;
  const phone = nonEmpty(params.phone) ?? nonEmpty(profile?.phone);
  const fullName = nonEmpty(params.full_name) ?? nonEmpty(profile?.full_name);
  const personalAddress =
    nonEmpty(params.personal_address) ?? nonEmpty(profile?.personal_address);

  // The explicit Agree tap is not inferable from the profile: it must have
  // been carried through this flow. Every personal path (fresh signup and
  // authenticated resume alike) passes through the country/legal screen, so a
  // missing flag means the flow was entered sideways — resume, don't complete.
  const agreed = params.legal === LEGAL_AGREED;

  if (!username || !country || !phone || !fullName || !personalAddress || !agreed) {
    return { kind: 'incomplete' };
  }

  return {
    kind: 'complete',
    answers: {
      username,
      country,
      phone,
      full_name: fullName,
      personal_address: personalAddress,
    },
  };
}
