import { useLocalSearchParams, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AuthTitleBlock } from '@/components/auth/auth-title-block';
import { BackButton } from '@/components/auth/back-button';
import { GoogleSignInButton } from '@/components/auth/google-signin-button';
import { LabeledTextInput } from '@/components/auth/labeled-text-input';
import { PrimaryButton } from '@/components/auth/primary-button';
import { ScreenContainer } from '@/components/auth/screen-container';
import { LegalAgreementFooter } from '@/components/legal/legal-agreement-footer';
import { COLORS } from '@/constants/colors';
import { useAuth } from '@/contexts/auth-context';
import {
  finalizePersonalSignup,
  sendEmailOtp,
  signInWithGoogleOAuth,
} from '@/lib/auth/auth-service';
import { HOME_ROUTE, resolvePostAuthRoute } from '@/lib/auth/onboarding-routing';
import { isValidEmail } from '@/utils/auth-validation';

// Completes any pending browser auth session (no-op on native, required on web).
WebBrowser.maybeCompleteAuthSession();

export default function PersonalEmailScreen() {
  const router = useRouter();
  // Pre-auth onboarding answers riding through the flow; forwarded to the
  // confirmation screen so they survive until sign-up commits them. The
  // Google OAuth round trip runs in an in-app browser session that resolves
  // back into this same screen instance, so these params survive it too — no
  // separate persistence is needed (same mechanism business sign-up relies on).
  const carriedParams = useLocalSearchParams<{
    flow?: string;
    username?: string;
    country?: string;
    legal?: string;
    phone?: string;
    full_name?: string;
    personal_address?: string;
  }>();
  const { isAuthenticated, refreshProfile } = useAuth();
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const isEmailValid = isValidEmail(email);
  const isBusy = isLoading || isGoogleLoading;

  async function handleNext() {
    if (!isEmailValid || isBusy) return;

    setIsLoading(true);
    setErrorMessage(null);

    const { error } = await sendEmailOtp(email);

    setIsLoading(false);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    router.push({
      pathname: '/auth/personal-email-confirmation',
      params: { ...carriedParams, email: email.trim(), accountType: 'personal' },
    });
  }

  /**
   * Google is an alternative way to authenticate this same personal signup:
   * OAuth replaces the email/OTP step (no code is sent), then the flow
   * converges on the SAME finalization the OTP path uses —
   * finalizePersonalSignup, which fixes the account type to 'personal',
   * requires the carried explicit legal agreement, commits the carried
   * answers, and protects already-completed accounts (resume, never
   * overwrite). The authenticated Google identity's email is authoritative.
   */
  async function handleGoogle() {
    if (isBusy) return;

    setIsGoogleLoading(true);
    setErrorMessage(null);

    // A previous attempt already authenticated but failed while finalizing;
    // retry the finalization without another OAuth round trip.
    if (!isAuthenticated) {
      const { error, cancelled } = await signInWithGoogleOAuth();

      if (cancelled) {
        setIsGoogleLoading(false);
        return;
      }
      if (error) {
        setIsGoogleLoading(false);
        setErrorMessage(error.message);
        return;
      }
    }

    const result = await finalizePersonalSignup(null, carriedParams);

    if (result.status === 'error') {
      setIsGoogleLoading(false);
      setErrorMessage(result.error.message);
      return;
    }

    await refreshProfile();
    setIsGoogleLoading(false);

    if (result.status === 'completed') {
      router.replace(HOME_ROUTE);
      return;
    }

    // Already-completed account, or answers missing: route by profile state.
    router.replace(resolvePostAuthRoute(result.profile));
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
              disabled={!isEmailValid || isBusy}
            />
          </View>

          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>OR</Text>
            <View style={styles.dividerLine} />
          </View>

          <GoogleSignInButton
            label={isGoogleLoading ? 'Connecting…' : 'Continue with Google'}
            onPress={handleGoogle}
            disabled={isBusy}
          />

          {/* Both actions above (email code and Google) lead to the signup
              finalization that records this acceptance server-side. */}
          <LegalAgreementFooter />
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
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginVertical: 24,
  },
  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: COLORS.cardBorder,
  },
  dividerText: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 1,
    color: COLORS.mutedText,
  },
});
