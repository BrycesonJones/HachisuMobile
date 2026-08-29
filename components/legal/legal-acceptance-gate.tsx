import { useCallback, useEffect, useState } from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PrimaryButton } from '@/components/auth/primary-button';
import { LegalDocumentView } from '@/components/legal/legal-document-view';
import { COLORS } from '@/constants/colors';
import { LEGAL_DOCUMENTS, legalDocumentBySlug } from '@/constants/legal';
import { LEGAL_CONTENT } from '@/constants/legal-content.generated';
import { useAuth } from '@/contexts/auth-context';
import {
  hasCurrentLegalAcceptance,
  recordCurrentLegalAcceptance,
} from '@/lib/legal/consent';

type GateStatus = 'idle' | 'checking' | 'required' | 'satisfied';

/**
 * Blocks normal app use for authenticated, fully-onboarded users who have not
 * accepted the CURRENT Terms of Service and E-Sign Consent versions (users who
 * predate consent capture, or whose accepted versions are now outdated).
 *
 * Rendered above the root navigator as a full-screen overlay, so no route can
 * be interacted with until acceptance succeeds; the user stays signed in the
 * whole time. Users still in onboarding are never gated here — their
 * acceptance is captured by completeOnboarding before onboarding finishes.
 *
 * Fail-open on CHECK failure only (e.g. offline): a network error must not
 * lock users out of the app, and the check re-runs on the next session/profile
 * change. Acceptance itself never fails open — the gate stays up until the
 * server confirms the write.
 */
export function LegalAcceptanceGate() {
  const { user, profile, isLoading, isAuthenticated, isDevSession } = useAuth();
  const [status, setStatus] = useState<GateStatus>('idle');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [openDocSlug, setOpenDocSlug] = useState<string | null>(null);

  const shouldCheck =
    !isLoading &&
    isAuthenticated &&
    !isDevSession &&
    user != null &&
    profile?.onboarding_completed === true;

  useEffect(() => {
    if (!shouldCheck || !user) {
      setStatus('idle');
      return;
    }

    let cancelled = false;
    setStatus('checking');

    hasCurrentLegalAcceptance(user.id)
      .then((accepted) => {
        if (cancelled) return;
        setStatus(accepted ? 'satisfied' : 'required');
      })
      .catch(() => {
        // Could not check (e.g. offline). Fail open rather than locking the
        // user out; the check re-runs on the next auth/profile change.
        if (!cancelled) setStatus('satisfied');
      });

    return () => {
      cancelled = true;
    };
  }, [shouldCheck, user]);

  const handleAgree = useCallback(async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setErrorMessage(null);

    const { error } = await recordCurrentLegalAcceptance('legal_gate');

    setIsSubmitting(false);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    setStatus('satisfied');
  }, [isSubmitting]);

  if (status !== 'required') return null;

  const openDoc = legalDocumentBySlug(openDocSlug ?? undefined);
  const openDocBlocks = openDoc ? LEGAL_CONTENT[openDoc.slug] : undefined;

  return (
    <View style={StyleSheet.absoluteFill}>
      <SafeAreaView style={styles.container} edges={['top', 'bottom', 'left', 'right']}>
        <View style={styles.content}>
          <Text style={styles.title}>A quick legal update</Text>
          <Text style={styles.body}>
            Before you continue, please review and accept the current Terms of Service and
            Electronic Communications and E-Sign Consent, and take a moment to read the
            Privacy Notice.
          </Text>

          <View style={styles.documentList}>
            {LEGAL_DOCUMENTS.map((doc) => (
              <Text
                key={doc.key}
                style={styles.documentLink}
                accessibilityRole="link"
                onPress={() => setOpenDocSlug(doc.slug)}>
                {doc.title}
              </Text>
            ))}
          </View>
        </View>

        <View style={styles.footer}>
          <Text style={styles.disclosure}>
            By tapping “Agree and continue”, you agree to the Terms of Service and the
            Electronic Communications and E-Sign Consent, and acknowledge that you have
            received the Privacy Notice.
          </Text>
          {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
          <PrimaryButton
            label={isSubmitting ? 'Saving…' : 'Agree and continue'}
            onPress={handleAgree}
            disabled={isSubmitting}
          />
        </View>
      </SafeAreaView>

      <Modal
        visible={openDoc != null}
        animationType="slide"
        onRequestClose={() => setOpenDocSlug(null)}>
        {openDoc && openDocBlocks ? (
          <LegalDocumentView
            title={openDoc.title}
            blocks={openDocBlocks}
            onBack={() => setOpenDocSlug(null)}
          />
        ) : null}
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    paddingHorizontal: 24,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: COLORS.primaryText,
    textAlign: 'center',
  },
  body: {
    marginTop: 12,
    fontSize: 15,
    lineHeight: 22,
    color: COLORS.secondaryText,
    textAlign: 'center',
  },
  documentList: {
    marginTop: 32,
    gap: 12,
  },
  documentLink: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.primaryText,
    textAlign: 'center',
    paddingVertical: 12,
    backgroundColor: COLORS.card,
    borderRadius: 12,
    overflow: 'hidden',
  },
  footer: {
    paddingBottom: 16,
  },
  disclosure: {
    fontSize: 13,
    lineHeight: 19,
    color: COLORS.mutedText,
    textAlign: 'center',
    marginBottom: 16,
  },
  errorText: {
    marginBottom: 12,
    fontSize: 14,
    color: COLORS.orange,
    textAlign: 'center',
  },
});
