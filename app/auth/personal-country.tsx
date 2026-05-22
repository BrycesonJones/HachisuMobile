import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { AuthProgressHeader } from '@/components/auth/auth-progress-header';
import { AuthTitleBlock } from '@/components/auth/auth-title-block';
import { CountrySelectorCard } from '@/components/auth/country-selector-card';
import { PrimaryButton } from '@/components/auth/primary-button';
import { ScreenContainer } from '@/components/auth/screen-container';
import { COLORS } from '@/constants/colors';
import {
  PERSONAL_ONBOARDING_PROGRESS,
  PERSONAL_ONBOARDING_STEP_COUNT,
} from '@/constants/personal-onboarding-progress';

function LegalConsentText() {
  function handleLinkPress(_label: string) {
    // TODO: open legal document URLs (E-Sign Consent, Terms of Service, Privacy Notice)
  }

  return (
    <Text style={styles.legalText}>
      By tapping &ldquo;Agree,&rdquo; you agree to the{' '}
      <Text style={styles.link} onPress={() => handleLinkPress('E-Sign Consent')}>
        E-Sign Consent
      </Text>
      ,{' '}
      <Text style={styles.link} onPress={() => handleLinkPress('Terms of Service')}>
        Terms of Service
      </Text>
      , and{' '}
      <Text style={styles.link} onPress={() => handleLinkPress('Privacy Notice')}>
        Privacy Notice
      </Text>
      .
    </Text>
  );
}

export default function PersonalCountryScreen() {
  const router = useRouter();

  function handleAgree() {
    router.push('/auth/personal-phone');
  }

  return (
    <ScreenContainer style={styles.container}>
      <AuthProgressHeader
        variant="back"
        totalSteps={PERSONAL_ONBOARDING_STEP_COUNT}
        activeIndex={PERSONAL_ONBOARDING_PROGRESS.country}
      />

      <AuthTitleBlock
        title="Where are you from?"
        subtitle="Select the country where you live"
        centered
      />

      <CountrySelectorCard label="Select your country" value="United States" />

      <View style={styles.footer}>
        <LegalConsentText />
        <PrimaryButton label="Agree" onPress={handleAgree} />
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  footer: {
    marginTop: 'auto',
    gap: 20,
    paddingBottom: 16,
  },
  legalText: {
    fontSize: 13,
    lineHeight: 20,
    color: COLORS.secondaryText,
    textAlign: 'center',
  },
  link: {
    textDecorationLine: 'underline',
    color: COLORS.secondaryText,
  },
});
