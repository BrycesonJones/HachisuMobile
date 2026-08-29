import { useRouter } from 'expo-router';
import { StyleSheet, Text } from 'react-native';

import { COLORS } from '@/constants/colors';

interface LegalAgreementFooterProps {
  /**
   * The label of the button this disclosure sits above (e.g. "Continue").
   * Omit on screens with more than one committing action (e.g. email +
   * Google sign-in), where the copy falls back to "By continuing".
   */
  actionLabel?: string;
}

/**
 * The onboarding legal disclosure. Shown directly above the screen's primary
 * action so tapping that action is the user's affirmative assent; the actual
 * server-side consent record is written by completeOnboarding, which every
 * signup path funnels through and which fails (retryably) if the record
 * cannot be persisted.
 *
 * The Terms of Service and E-Sign Consent are agreements; the Privacy Notice
 * is deliberately worded as acknowledged, not agreed to.
 */
export function LegalAgreementFooter({ actionLabel }: LegalAgreementFooterProps) {
  const router = useRouter();

  return (
    <Text style={styles.text}>
      {actionLabel ? `By tapping “${actionLabel}”, you agree to the ` : 'By continuing, you agree to the '}
      <Text style={styles.link} onPress={() => router.push('/legal/terms-of-service')}>
        Terms of Service
      </Text>{' '}
      and the{' '}
      <Text style={styles.link} onPress={() => router.push('/legal/e-sign-consent')}>
        Electronic Communications and E-Sign Consent
      </Text>
      , and acknowledge that you have received the{' '}
      <Text style={styles.link} onPress={() => router.push('/legal/privacy-notice')}>
        Privacy Notice
      </Text>
      .
    </Text>
  );
}

const styles = StyleSheet.create({
  text: {
    marginTop: 16,
    fontSize: 13,
    lineHeight: 19,
    color: COLORS.mutedText,
    textAlign: 'center',
  },
  link: {
    color: COLORS.primaryText,
    fontWeight: '600',
  },
});
