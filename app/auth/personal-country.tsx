import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AuthProgressHeader } from '@/components/auth/auth-progress-header';
import { AuthTitleBlock } from '@/components/auth/auth-title-block';
import { CountrySelectorCard } from '@/components/auth/country-selector-card';
import { PrimaryButton } from '@/components/auth/primary-button';
import { ScreenContainer } from '@/components/auth/screen-container';
import { LegalAgreementFooter } from '@/components/legal/legal-agreement-footer';
import { COLORS } from '@/constants/colors';
import {
  PERSONAL_ONBOARDING_PROGRESS,
  PERSONAL_ONBOARDING_STEP_COUNT,
} from '@/constants/personal-onboarding-progress';
import { isSupportedCountry, SUPPORTED_COUNTRIES } from '@/constants/supported-countries';
import { LEGAL_AGREED } from '@/lib/auth/personal-signup';

/**
 * Pre-auth screen: personal sign-up verifies the email LAST, so there is no
 * Supabase session here and nothing may be persisted yet. The selected
 * country — and the fact that the user tapped Agree under the legal
 * disclosure — ride the flow as route params and are committed by
 * finalizePersonalSignup after the OTP succeeds (the authoritative versioned
 * consent record is written server-side by completeOnboarding at that point).
 *
 * The launch is limited to SUPPORTED_COUNTRIES: the selector offers exactly
 * that list, stores the full canonical name, and Agree stays disabled until
 * one is chosen.
 */
export default function PersonalCountryScreen() {
  const router = useRouter();
  // Answers carried from earlier pre-auth steps (username), forwarded onward.
  // A carried country (e.g. re-entering this screen via a stale link) is only
  // adopted when it is one of the launch countries.
  const carriedParams = useLocalSearchParams<{
    flow?: string;
    username?: string;
    country?: string;
  }>();
  const [country, setCountry] = useState<string | null>(() =>
    isSupportedCountry(carriedParams.country) ? carriedParams.country : null,
  );

  function handleAgree() {
    if (!isSupportedCountry(country)) return;
    router.push({
      pathname: '/auth/personal-phone',
      params: { ...carriedParams, country, legal: LEGAL_AGREED },
    });
  }

  return (
    <ScreenContainer style={styles.container}>
      <AuthProgressHeader
        variant="back"
        totalSteps={PERSONAL_ONBOARDING_STEP_COUNT}
        activeIndex={PERSONAL_ONBOARDING_PROGRESS.country}
      />

      <AuthTitleBlock
        title="Where do you live?"
        subtitle="Select your country of residence"
        centered
      />

      <CountrySelectorCard
        label="Select your country"
        value={country}
        options={SUPPORTED_COUNTRIES}
        onSelect={setCountry}
      />

      <Text style={styles.availabilityNote}>
        Hachisu is currently available in select countries.
      </Text>

      <View style={styles.footer}>
        <LegalAgreementFooter actionLabel="Agree" />
        <PrimaryButton label="Agree" onPress={handleAgree} disabled={!country} />
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  availabilityNote: {
    marginTop: 12,
    fontSize: 13,
    lineHeight: 18,
    color: COLORS.mutedText,
    textAlign: 'center',
  },
  footer: {
    marginTop: 'auto',
    gap: 20,
    paddingBottom: 16,
  },
});
