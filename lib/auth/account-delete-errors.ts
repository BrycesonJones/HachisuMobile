// User-facing classification of a failed delete-account call.
//
// Two live failure shapes existed (2026-09-02):
//   - "Not authenticated." — the Edge Function's 401 for a dead session,
//     surfaced raw. It happens when a deletion is retried after a previous
//     attempt already deleted the account (the session is now for a deleted
//     identity), or with any stale session. Raw backend auth text must never
//     reach the dialog; the truthful, actionable copy is that the session is
//     no longer valid.
//   - Server-crafted retryable copy ("Could not close your account…",
//     "Could not remove your payment-processing stores…") — already written
//     for users and passed through.
//
// Anything unrecognized falls back to the generic retry copy so no raw
// Supabase/Edge/BTCPay text can leak. Deliberately import-free for Node tests.

export const SESSION_EXPIRED_MESSAGE =
  'Your session has expired. Please sign in again.';

export const GENERIC_CLOSE_ACCOUNT_MESSAGE =
  'Could not close your account. Please try again.';

/** Copy our own Edge Function writes for users — safe to show verbatim. */
const SERVER_USER_FACING_PREFIXES = [
  'Could not close your account',
  'Could not remove your payment-processing stores',
];

export interface CloseAccountFailure {
  /** True when the failure means the local session is dead, not the deletion. */
  sessionExpired: boolean;
  message: string;
}

/**
 * Maps a delete-account failure (HTTP status where known, plus the server's
 * `error` body text where readable) to the dialog copy.
 */
export function classifyCloseAccountFailure(
  status: number | undefined,
  detail: string | undefined,
): CloseAccountFailure {
  const text = (detail ?? '').trim();
  const lower = text.toLowerCase();

  if (
    status === 401 ||
    status === 403 ||
    lower === 'not authenticated.' ||
    lower.includes('authorization header') ||
    lower.includes('jwt') ||
    lower.includes('auth session missing')
  ) {
    return { sessionExpired: true, message: SESSION_EXPIRED_MESSAGE };
  }

  if (SERVER_USER_FACING_PREFIXES.some((prefix) => text.startsWith(prefix))) {
    return { sessionExpired: false, message: text };
  }

  return { sessionExpired: false, message: GENERIC_CLOSE_ACCOUNT_MESSAGE };
}
