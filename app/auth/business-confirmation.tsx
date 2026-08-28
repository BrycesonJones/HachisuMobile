import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AuthTitleBlock } from '@/components/auth/auth-title-block';
import { BackButton } from '@/components/auth/back-button';
import { OtpInputPlaceholder } from '@/components/auth/otp-input-placeholder';
import { PrimaryButton } from '@/components/auth/primary-button';
import { ScreenContainer } from '@/components/auth/screen-container';
import { COLORS } from '@/constants/colors';
import { useAuth } from '@/contexts/auth-context';
import { isAuthDevBypassEnabled } from '@/lib/auth/config';
import { applyOnboardingDraft, ensureUserProfile, verifyEmailOtp } from '@/lib/auth/auth-service';
import { clearOnboardingDraft } from '@/lib/auth/onboarding-draft';
import { resolvePostAuthRoute } from '@/lib/auth/onboarding-routing';
import type { AccountType, UserProfile } from '@/types/user-profile';

const CODE_LENGTH = 6;

export default function BusinessEmailConfirmationScreen() {
  const router = useRouter();
  const { devSignIn, isAuthenticated, profile: sessionProfile, refreshProfile } = useAuth();
  const { email, accountType } = useLocalSearchParams<{ email?: string; accountType?: string }>();
  const [code, setCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const displayEmail = typeof email === 'string' && email.length > 0 ? email : 'your email';
  const isCodeComplete = code.length === CODE_LENGTH;
  const resolvedAccountType: AccountType =
    accountType === 'personal' ? 'personal' : 'business';

  async function handleNext() {
    if (!isCodeComplete || isLoading || typeof email !== 'string') return;

    setIsLoading(true);
    setErrorMessage(null);

    // A previous attempt already verified this code and signed the user in, but
    // failed while committing their answers. The code is single-use, so retry the
    // commit rather than the verification — which would now fail as expired.
    if (isAuthenticated) {
      await finishSignUp(sessionProfile);
      return;
    }

    if (isAuthDevBypassEnabled) {
      console.warn(`[auth] Dev bypass: accepting code for ${email}`);
      await devSignIn(email, resolvedAccountType);
      await finishSignUp(null);
      return;
    }

    const { error: verifyError } = await verifyEmailOtp(email, code);

    if (verifyError) {
      setIsLoading(false);
      setErrorMessage(verifyError.message);
      return;
    }

    const { profile, error: profileError } = await ensureUserProfile({
      email,
      accountType: resolvedAccountType,
      onboardingStatus: 'email_verified',
    });

    if (profileError) {
      setIsLoading(false);
      setErrorMessage(profileError.message);
      return;
    }

    await finishSignUp(profile);
  }

  /**
   * Writes the answers collected before this screen to the now-authenticated
   * user, then routes from the resulting profile — the completed business flow
   * lands on the dashboard, anything less resumes where it left off.
   */
  async function finishSignUp(profile: UserProfile | null) {
    // Signing in to an account that already finished onboarding: send them on
    // rather than through sign-up again, and never overwrite their profile with
    // answers collected in this session.
    if (profile?.onboarding_completed) {
      clearOnboardingDraft();
      await refreshProfile();
      setIsLoading(false);
      router.replace(resolvePostAuthRoute(profile));
      return;
    }

    const { profile: applied, error: applyError } = await applyOnboardingDraft();

    if (applyError) {
      setIsLoading(false);
      setErrorMessage(applyError.message);
      return;
    }

    await refreshProfile();
    setIsLoading(false);

    const nextProfile = applied ?? profile;
    router.replace(
      nextProfile ? resolvePostAuthRoute(nextProfile) : '/auth/choose-username',
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
          <View style={styles.header}>
            <BackButton fallback="/auth/business-email" />
          </View>

          <AuthTitleBlock
            title="Enter confirmation code"
            subtitle={`We sent a code to ${displayEmail}`}
            centered
          />

          <OtpInputPlaceholder value={code} onChange={setCode} length={CODE_LENGTH} />

          {isAuthDevBypassEnabled ? (
            <Text style={styles.helperText}>
              Dev mode: any 6-digit code works — no real Supabase user is created.
            </Text>
          ) : (
            <Text style={styles.helperText}>Check your email for the 6-digit code.</Text>
          )}

          {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

          <View style={styles.buttonArea}>
            <PrimaryButton
              label={isLoading ? 'Verifying…' : 'Next'}
              onPress={handleNext}
              disabled={!isCodeComplete || isLoading}
            />
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
  header: {
    paddingTop: 8,
    paddingBottom: 24,
  },
  helperText: {
    marginTop: 20,
    fontSize: 13,
    color: COLORS.mutedText,
    textAlign: 'center',
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
