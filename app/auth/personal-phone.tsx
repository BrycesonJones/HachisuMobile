import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AuthProgressHeader } from '@/components/auth/auth-progress-header';
import { AuthTitleBlock } from '@/components/auth/auth-title-block';
import { PhoneNumberInput } from '@/components/auth/phone-number-input';
import { PrimaryButton } from '@/components/auth/primary-button';
import { ScreenContainer } from '@/components/auth/screen-container';
import { COLORS } from '@/constants/colors';
import {
  PERSONAL_ONBOARDING_PROGRESS,
  PERSONAL_ONBOARDING_STEP_COUNT,
} from '@/constants/personal-onboarding-progress';
import {
  isValidPhoneForCountry,
  normalizePhoneForCountry,
  phoneMetadataFor,
} from '@/constants/supported-countries';

/**
 * Pre-auth screen: no Supabase session exists here. The phone number is
 * collected as plain profile information (no SMS verification exists), rides
 * the flow as a route param in E.164 form, and is persisted by
 * finalizePersonalSignup after the OTP succeeds.
 *
 * The flag, calling code, placeholder, and validation all derive from the
 * country selected on the previous step — the carried country name, not the
 * calling code, is the source of truth (Canada shows 🇨🇦 despite +1).
 */
export default function PersonalPhoneScreen() {
  const router = useRouter();
  // Pre-auth answers carried from earlier steps (username, country, legal
  // agreement), forwarded onward untouched.
  const carriedParams = useLocalSearchParams<{
    flow?: string;
    username?: string;
    country?: string;
    legal?: string;
  }>();
  const [phone, setPhone] = useState('');

  const phoneMeta = phoneMetadataFor(carriedParams.country);
  const isPhoneValid = isValidPhoneForCountry(carriedParams.country, phone);

  function handleNext() {
    const normalized = normalizePhoneForCountry(carriedParams.country, phone);
    if (!normalized) return;
    router.push({
      pathname: '/auth/verify-personal',
      params: { ...carriedParams, phone: normalized },
    });
  }

  // Reached without a valid launch country (stale deep link, malformed
  // state): never guess a country or show a misleading US default — send the
  // user back to pick one, keeping the answers already carried.
  if (!phoneMeta) {
    return (
      <ScreenContainer style={styles.recoveryContainer}>
        <AuthProgressHeader
          variant="back"
          totalSteps={PERSONAL_ONBOARDING_STEP_COUNT}
          activeIndex={PERSONAL_ONBOARDING_PROGRESS.phone}
        />

        <AuthTitleBlock
          title="Select your country first"
          subtitle="We need your country of residence before your phone number"
          centered
        />

        <Text style={styles.recoveryText}>
          Hachisu is currently available in select countries.
        </Text>

        <View style={styles.recoveryButtonArea}>
          <PrimaryButton
            label="Choose your country"
            onPress={() =>
              router.replace({
                pathname: '/auth/personal-country',
                params: {
                  flow: carriedParams.flow,
                  username: carriedParams.username,
                },
              })
            }
          />
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <AuthProgressHeader
            variant="back"
            totalSteps={PERSONAL_ONBOARDING_STEP_COUNT}
            activeIndex={PERSONAL_ONBOARDING_PROGRESS.phone}
          />

          <AuthTitleBlock
            title="Enter your phone number"
            subtitle="A way to reach you about your account"
            centered
          />

          <PhoneNumberInput
            label="Your phone number"
            value={phone}
            onChangeText={setPhone}
            placeholder={phoneMeta.placeholder}
            callingCode={phoneMeta.callingCode}
            flag={phoneMeta.flag}
          />

          <View style={styles.buttonArea}>
            <PrimaryButton label="Next" onPress={handleNext} disabled={!isPhoneValid} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 32,
  },
  buttonArea: {
    marginTop: 32,
  },
  recoveryContainer: {
    flex: 1,
  },
  recoveryText: {
    marginTop: 12,
    fontSize: 13,
    lineHeight: 18,
    color: COLORS.mutedText,
    textAlign: 'center',
  },
  recoveryButtonArea: {
    marginTop: 32,
  },
});
