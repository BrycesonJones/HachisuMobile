// Startup validation of a RESTORED Supabase session.
//
// supabase.auth.getSession() only reads the locally persisted session — it
// proves nothing about the server. After account deletion the access token
// stays cryptographically valid until it expires, so a device that missed the
// local sign-out (force-kill right after the backend deleted the account, an
// interrupted response, an old app version) restores a session for an
// identity that no longer exists. Its profile row is gone too, which made the
// router read the ghost as "authenticated user who hasn't onboarded" and send
// it to choose-account-type.
//
// A missing profile alone cannot distinguish that ghost from a LEGITIMATE
// authenticated user mid-signup (OTP/Google verified moments before
// finalization creates the row). The authoritative disambiguator is
// supabase.auth.getUser() — a server round trip that validates the JWT and
// looks up the identity. This module classifies its outcome:
//
//   'valid'         — the server confirmed the identity exists. Keep the
//                     session; a missing profile means real (resumable)
//                     onboarding.
//   'invalid'       — the server answered authoritatively that the identity or
//                     session no longer exists (deleted user, dead refresh
//                     token, bad JWT). Purge the local session and land on the
//                     public page.
//   'indeterminate' — the check itself could not run (network failure, 5xx,
//                     anything unrecognized). NEVER sign out on this: failing
//                     to verify is not evidence of invalidity, and treating it
//                     as such would log users out on a bad connection.
//
// Deliberately free of React Native / supabase imports so the classification
// table can be exercised directly in Node unit tests.

export type AuthIdentityVerdict = 'valid' | 'invalid' | 'indeterminate';

/** Structural shape of a supabase-js auth error (AuthApiError et al.). */
export interface AuthCheckError {
  name?: string;
  message?: string;
  status?: number;
  code?: string;
}

/**
 * GoTrue error codes that unambiguously mean the identity/session is dead.
 * Sourced from supabase-js AuthApiError codes for: deleted user, session
 * revoked/expired server-side, refresh token dead (deletion revokes it),
 * malformed/unusable JWT, banned user.
 */
const INVALID_IDENTITY_CODES = new Set([
  'user_not_found',
  'session_not_found',
  'session_expired',
  'refresh_token_not_found',
  'refresh_token_already_used',
  'bad_jwt',
  'user_banned',
]);

/**
 * Classifies the outcome of supabase.auth.getUser() for a restored session.
 * See the module comment for what each verdict must trigger.
 */
export function classifyAuthIdentityCheck(result: {
  user: unknown | null;
  error: AuthCheckError | null;
}): AuthIdentityVerdict {
  const { user, error } = result;

  if (!error) {
    // getUser success always carries the user; a shape with neither error nor
    // user is malformed, and a malformed answer must not purge anything.
    return user ? 'valid' : 'indeterminate';
  }

  const name = error.name ?? '';
  const message = (error.message ?? '').toLowerCase();

  // The check never reached the server: connectivity, timeouts, retryable
  // fetch failures. Unverifiable is not invalid.
  if (name === 'AuthRetryableFetchError' || error.status === 0) return 'indeterminate';
  if (name === 'TypeError' || message.includes('network') || message.includes('fetch')) {
    return 'indeterminate';
  }

  // The local session evaporated mid-check — nothing usable remains to keep.
  if (name === 'AuthSessionMissingError' || message.includes('auth session missing')) {
    return 'invalid';
  }

  if (typeof error.code === 'string' && INVALID_IDENTITY_CODES.has(error.code)) {
    return 'invalid';
  }

  // Authoritative auth-endpoint rejections of this credential/identity.
  if (error.status === 401 || error.status === 403 || error.status === 404) {
    return 'invalid';
  }

  // Server-side trouble (5xx) or anything unrecognized: fail safe, keep the
  // session — the existing retry/error behavior applies.
  return 'indeterminate';
}

/**
 * The startup decision: purge the restored session only when the profile row
 * is missing AND the server authoritatively said the identity is gone. A
 * loaded profile proves the identity exists (the row read succeeded under its
 * JWT and the row survived, i.e. no deletion cascade removed it), so the
 * server check is skipped entirely — cold starts for healthy accounts pay no
 * extra round trip.
 */
export function shouldPurgeRestoredSession(
  profileFound: boolean,
  verdict: AuthIdentityVerdict,
): boolean {
  return !profileFound && verdict === 'invalid';
}
