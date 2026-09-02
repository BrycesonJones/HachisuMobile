import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { AuthTitleBlock } from '@/components/auth/auth-title-block';
import { BackButton } from '@/components/auth/back-button';
import { LabeledTextInput } from '@/components/auth/labeled-text-input';
import { PrimaryButton } from '@/components/auth/primary-button';
import { LegalAgreementFooter } from '@/components/legal/legal-agreement-footer';
import { COLORS } from '@/constants/colors';
import { useAuth } from '@/contexts/auth-context';
import { finalizePersonalSignup } from '@/lib/auth/auth-service';
import { HOME_ROUTE, resolvePostAuthRoute } from '@/lib/auth/onboarding-routing';
import {
  formatDateOfBirthInput,
  isNonEmpty,
  isValidDateOfBirth,
  isValidZip,
} from '@/utils/auth-validation';

// Note: DOB is collected for KYC UX parity but is intentionally NOT persisted to
// user_profiles. It will be sent to a KYC provider in a future iteration.
// SSN is deliberately not collected anywhere in onboarding (see the Privacy
// Notice: "We do not collect Social Security numbers").

function buildPersonalAddress({
  streetAddress,
  apartment,
  city,
  state,
  zipCode,
}: {
  streetAddress: string;
  apartment: string;
  city: string;
  state: string;
  zipCode: string;
}): string {
  const line1 = [streetAddress.trim(), apartment.trim()].filter(Boolean).join(', ');
  const cityStateZip = [city.trim(), [state.trim(), zipCode.trim()].filter(Boolean).join(' ')]
    .filter(Boolean)
    .join(', ');
  return [line1, cityStateZip].filter(Boolean).join(', ');
}

export default function PersonalVerificationInfoScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isAuthenticated, refreshProfile } = useAuth();
  // Pre-auth answers carried from earlier steps (username, country, legal
  // agreement, phone), forwarded into the email/OTP finalization.
  const carriedParams = useLocalSearchParams<{
    flow?: string;
    username?: string;
    country?: string;
    legal?: string;
    phone?: string;
  }>();
  const [fullName, setFullName] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [streetAddress, setStreetAddress] = useState('');
  const [apartment, setApartment] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [zipCode, setZipCode] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isFormValid = useMemo(
    () =>
      isNonEmpty(fullName) &&
      isValidDateOfBirth(dateOfBirth) &&
      isNonEmpty(streetAddress) &&
      isNonEmpty(city) &&
      isNonEmpty(state) &&
      isValidZip(zipCode),
    [fullName, dateOfBirth, streetAddress, city, state, zipCode],
  );

  function handleDateOfBirthChange(value: string) {
    setDateOfBirth(formatDateOfBirthInput(value));
  }

  async function handleContinue() {
    if (!isFormValid || isSaving) return;

    const personalAddress = buildPersonalAddress({
      streetAddress,
      apartment,
      city,
      state,
      zipCode,
    });

    const answers = {
      ...carriedParams,
      full_name: fullName.trim(),
      personal_address: personalAddress,
    };

    // Fresh signup: no session exists yet, so nothing can be persisted here.
    // Carry the answers into the email/OTP step; verifying the code is what
    // authenticates and commits them (finalizePersonalSignup).
    if (!isAuthenticated) {
      router.push({ pathname: '/auth/personal-email', params: answers });
      return;
    }

    // Resume: a session already exists (e.g. a previous finalization failed
    // after the OTP, or an authenticated user re-entered onboarding), so
    // finalize directly instead of demanding a second email verification.
    setIsSaving(true);
    setErrorMessage(null);

    const result = await finalizePersonalSignup(null, answers);

    if (result.status === 'error') {
      setIsSaving(false);
      setErrorMessage(result.error.message);
      return;
    }

    await refreshProfile();
    setIsSaving(false);

    if (result.status === 'completed') {
      router.replace(HOME_ROUTE);
      return;
    }

    // Already-completed account, or answers missing: route by profile state.
    router.replace(resolvePostAuthRoute(result.profile));
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView
        style={styles.keyboardAvoidingView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top : 0}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: 140 + insets.bottom },
          ]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          scrollEnabled={true}
          bounces={true}
          showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <BackButton />
          </View>

          <View style={styles.content}>
            <AuthTitleBlock
              title="Personal information"
              subtitle="Enter the information required to verify your account."
              centered
            />

            <Text style={styles.helperText}>
              This information helps us protect your account and meet verification requirements.
            </Text>

            <View style={styles.form}>
              <LabeledTextInput
                label="Full legal name"
                value={fullName}
                onChangeText={setFullName}
                placeholder="Satoshi Nakamoto"
                autoCapitalize="words"
                autoCorrect={false}
              />
              <LabeledTextInput
                label="Date of birth"
                value={dateOfBirth}
                onChangeText={handleDateOfBirthChange}
                placeholder="MM/DD/YYYY"
                keyboardType="number-pad"
                maxLength={10}
              />
              <LabeledTextInput
                label="Street address"
                value={streetAddress}
                onChangeText={setStreetAddress}
                placeholder="123 Main Street"
                autoCapitalize="words"
              />
              <LabeledTextInput
                label="Apartment, suite, etc. optional"
                value={apartment}
                onChangeText={setApartment}
                placeholder="Apt 4B"
                autoCapitalize="words"
              />
              <LabeledTextInput
                label="City"
                value={city}
                onChangeText={setCity}
                placeholder="Atlanta"
                autoCapitalize="words"
              />
              <LabeledTextInput
                label="State"
                value={state}
                onChangeText={setState}
                placeholder="GA"
                autoCapitalize="characters"
                maxLength={2}
              />
              <LabeledTextInput
                label="ZIP code"
                value={zipCode}
                onChangeText={setZipCode}
                placeholder="30301"
                keyboardType="number-pad"
                maxLength={10}
              />
            </View>

            <Text style={styles.securityNote}>
              Your information is used for identity verification and account security.
            </Text>

            {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

            <View style={styles.buttonContainer}>
              <PrimaryButton
                label={isSaving ? 'Saving…' : 'Continue'}
                onPress={handleContinue}
                disabled={!isFormValid || isSaving}
              />
            </View>

            {/* Continue completes onboarding, which records this acceptance
                server-side first. */}
            <LegalAgreementFooter actionLabel="Continue" />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  keyboardAvoidingView: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 12,
  },
  header: {
    width: '100%',
    marginBottom: 32,
  },
  content: {
    width: '100%',
  },
  helperText: {
    fontSize: 14,
    lineHeight: 20,
    color: COLORS.mutedText,
    textAlign: 'center',
    marginBottom: 24,
  },
  form: {
    gap: 12,
  },
  securityNote: {
    fontSize: 13,
    lineHeight: 18,
    color: COLORS.mutedText,
    textAlign: 'center',
    marginTop: 20,
    marginBottom: 8,
  },
  buttonContainer: {
    marginTop: 28,
    marginBottom: 24,
  },
  errorText: {
    marginTop: 12,
    fontSize: 14,
    color: COLORS.orange,
    textAlign: 'center',
  },
});
