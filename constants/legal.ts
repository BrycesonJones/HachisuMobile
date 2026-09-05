/**
 * Single source of truth for the CURRENT legal document versions.
 *
 * Version strings are explicit legal versions, not filenames. Bumping a
 * constant here is the mechanism that forces re-acceptance: the legal gate
 * compares a user's recorded acceptances against these values, and any user
 * who accepted an older version is gated until they accept the current one.
 *
 * When a document's legal content changes:
 *   1. Update the Markdown source in docs/legal/.
 *   2. Run `npm run generate:legal` to refresh the in-app content.
 *   3. Bump the matching CURRENT_*_VERSION below (new date + v-counter).
 */

import { LEGAL_CONTENT_PLACEHOLDERS } from '@/constants/legal-content.generated';

export const CURRENT_TERMS_VERSION = 'terms_2026-09-04_v1';
export const CURRENT_ESIGN_VERSION = 'esign_2026-09-01_v1';
export const CURRENT_PRIVACY_NOTICE_VERSION = 'privacy_2026-09-04_v2';

/** Database `document` discriminators (must match the migration's allow-list). */
export type LegalDocumentKey = 'terms_of_service' | 'esign_consent' | 'privacy_notice';

export interface LegalDocumentMeta {
  key: LegalDocumentKey;
  /** Route slug: /legal/[slug]. */
  slug: string;
  title: string;
  version: string;
  /** Agreements are accepted; notices are presented/acknowledged. */
  kind: 'agreement' | 'notice';
}

export const LEGAL_DOCUMENTS: readonly LegalDocumentMeta[] = [
  {
    key: 'terms_of_service',
    slug: 'terms-of-service',
    title: 'Terms of Service',
    version: CURRENT_TERMS_VERSION,
    kind: 'agreement',
  },
  {
    key: 'esign_consent',
    slug: 'e-sign-consent',
    title: 'E-Sign Consent',
    version: CURRENT_ESIGN_VERSION,
    kind: 'agreement',
  },
  {
    key: 'privacy_notice',
    slug: 'privacy-notice',
    title: 'Privacy Notice',
    version: CURRENT_PRIVACY_NOTICE_VERSION,
    kind: 'notice',
  },
] as const;

export function legalDocumentBySlug(slug: string | undefined): LegalDocumentMeta | null {
  if (!slug) return null;
  return LEGAL_DOCUMENTS.find((doc) => doc.slug === slug) ?? null;
}

// Loud dev-mode reminder: the shipped legal documents still contain unresolved
// placeholders (legal entity, addresses, governing law, …). These must be
// resolved in docs/legal/*.md — and the docs attorney-reviewed — before any
// production launch.
if (__DEV__ && LEGAL_CONTENT_PLACEHOLDERS.length > 0) {
  console.warn(
    `[legal] The legal documents contain ${LEGAL_CONTENT_PLACEHOLDERS.length} unresolved placeholder(s): ` +
      `${LEGAL_CONTENT_PLACEHOLDERS.join(', ')}. Not production-ready.`,
  );
}
