import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AuthTitleBlock } from '@/components/auth/auth-title-block';
import { BackButton } from '@/components/auth/back-button';
import { LabeledTextInput } from '@/components/auth/labeled-text-input';
import { LegalAgreementFooter } from '@/components/legal/legal-agreement-footer';
import { PrimaryButton } from '@/components/auth/primary-button';
import { ScreenContainer } from '@/components/auth/screen-container';
import { COLORS } from '@/constants/colors';
import { sendEmailOtp } from '@/lib/auth/auth-service';
import { isValidEmail } from '@/utils/auth-validation';

export default function BusinessEmailScreen() {
  const router = useRouter();
  // Pre-auth onboarding answers riding through the flow; forwarded to the
  // confirmation screen so they survive until sign-up commits them.
  const onboardingParams = useLocalSearchParams<{
    username?: string;
    business_name?: string;
    business_address?: string;
    business_website?: string;
    business_country?: string;
    business_description?: string;
    expected_monthly_volume?: string;
  }>();
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const isEmailValid = isValidEmail(email);

  async function handleNext() {
    if (!isEmailValid || isLoading) return;

    setIsLoading(true);
    setErrorMessage(null);

    const { error } = await sendEmailOtp(email);

    setIsLoading(false);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    router.push({
      pathname: '/auth/business-confirmation',
      params: { ...onboardingParams, email: email.trim(), accountType: 'business' },
    });
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
          <View style={styles.header}>
            <BackButton />
          </View>

          <AuthTitleBlock
            title="Enter your email"
            subtitle="We will send you a confirmation code"
          />

          <LabeledTextInput
            label="Email"
            value={email}
            onChangeText={setEmail}
            placeholder="satoshi@gmx.com"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
          />

          {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

          <View style={styles.buttonArea}>
            <PrimaryButton
              label={isLoading ? 'Sending…' : 'Next'}
              onPress={handleNext}
              disabled={!isEmailValid || isLoading}
            />
          </View>

          {/* Tapping Next is the affirmative assent; the signup finalization
              this leads to records the acceptance server-side. */}
          <LegalAgreementFooter actionLabel="Next" />
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
  header: {
    paddingTop: 8,
    paddingBottom: 24,
  },
  errorText: {
    marginTop: 16,
    fontSize: 14,
    color: COLORS.orange,
    textAlign: 'center',
  },
  buttonArea: {
    marginTop: 32,
  },
});
