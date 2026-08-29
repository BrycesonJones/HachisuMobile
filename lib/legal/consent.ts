import {
  CURRENT_ESIGN_VERSION,
  CURRENT_PRIVACY_NOTICE_VERSION,
  CURRENT_TERMS_VERSION,
} from '@/constants/legal';
import { isDevAuthActive } from '@/lib/auth/dev-session';
import { supabase } from '@/lib/supabase';

export type LegalAcceptanceSource = 'onboarding' | 'legal_gate';

export interface LegalConsentError {
  message: string;
}

/**
 * True when the authenticated user has accepted the CURRENT Terms of Service
 * and E-Sign Consent versions. The Privacy Notice is a notice, not an
 * agreement, so it never gates access.
 *
 * Throws on query failure so callers can distinguish "not accepted" from
 * "could not check" — the legal gate must not appear just because a request
 * failed offline.
 */
export async function hasCurrentLegalAcceptance(userId: string): Promise<boolean> {
  if (isDevAuthActive()) return true;

  const { data, error } = await supabase
    .from('user_legal_acceptances')
    .select('document, version')
    .eq('user_id', userId)
    .in('document', ['terms_of_service', 'esign_consent'])
    .in('version', [CURRENT_TERMS_VERSION, CURRENT_ESIGN_VERSION]);

  if (error) {
    throw new Error(error.message);
  }

  const accepted = new Set((data ?? []).map((row) => `${row.document}:${row.version}`));
  return (
    accepted.has(`terms_of_service:${CURRENT_TERMS_VERSION}`) &&
    accepted.has(`esign_consent:${CURRENT_ESIGN_VERSION}`)
  );
}

/**
 * Records the user's affirmative acceptance of the current Terms of Service
 * and E-Sign Consent, plus presentation of the current Privacy Notice, as
 * immutable server-side rows.
 *
 * Idempotent: rows are unique per (user, document, version) and the insert
 * ignores duplicates, so repeated taps or retried finalizations can never
 * create duplicate or conflicting records. Timestamps are enforced by a
 * database trigger — nothing client-supplied is trusted for time.
 */
export async function recordCurrentLegalAcceptance(
  source: LegalAcceptanceSource,
): Promise<{ error: LegalConsentError | null }> {
  if (isDevAuthActive()) return { error: null };

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { error: { message: userError?.message ?? 'No authenticated user' } };
  }

  const rows = [
    {
      user_id: user.id,
      document: 'terms_of_service',
      version: CURRENT_TERMS_VERSION,
      action: 'accepted',
      source,
    },
    {
      user_id: user.id,
      document: 'esign_consent',
      version: CURRENT_ESIGN_VERSION,
      action: 'accepted',
      source,
    },
    {
      user_id: user.id,
      document: 'privacy_notice',
      version: CURRENT_PRIVACY_NOTICE_VERSION,
      action: 'presented',
      source,
    },
  ];

  const { error } = await supabase
    .from('user_legal_acceptances')
    .upsert(rows, { onConflict: 'user_id,document,version', ignoreDuplicates: true });

  if (error) {
    return { error: { message: error.message } };
  }

  return { error: null };
}
