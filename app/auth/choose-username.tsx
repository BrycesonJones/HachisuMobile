import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AuthTitleBlock } from '@/components/auth/auth-title-block';
import { CloseButton } from '@/components/auth/close-button';
import { LabeledTextInput } from '@/components/auth/labeled-text-input';
import { PrimaryButton } from '@/components/auth/primary-button';
import { ProgressIndicator } from '@/components/auth/progress-indicator';
import { ScreenContainer } from '@/components/auth/screen-container';
import {
  BUSINESS_ONBOARDING_PROGRESS,
  BUSINESS_ONBOARDING_STEP_COUNT,
} from '@/constants/business-onboarding-progress';
import { COLORS } from '@/constants/colors';
import {
  PERSONAL_ONBOARDING_PROGRESS,
  PERSONAL_ONBOARDING_STEP_COUNT,
} from '@/constants/personal-onboarding-progress';
import { useAuth } from '@/contexts/auth-context';
import { updateUserProfile } from '@/lib/auth/auth-service';

export default function ChooseUsernameScreen() {
  const router = useRouter();
  const { isAuthenticated, refreshProfile } = useAuth();
  const { flow } = useLocalSearchParams<{ flow?: string }>();
  const [username, setUsername] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const isUsernameValid = username.trim().length > 0;
  const isPersonalFlow = flow === 'personal';

  async function handleNext() {
    if (!isUsernameValid || isLoading) return;

    // Signup reaches this screen before email authentication, and the profile
    // write below requires an authenticated user. With no session, carry the
    // username forward in the route params instead; it is persisted once the
    // user signs in at the end of the flow.
    if (!isAuthenticated) {
      if (isPersonalFlow) {
        router.push({
          pathname: '/auth/personal-country',
          params: { flow: 'personal', username: username.trim() },
        });
        return;
      }
      router.push({
        pathname: '/auth/verify-business',
        params: { username: username.trim() },
      });
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    const { error } = await updateUserProfile({
      username: username.trim(),
      onboarding_status: 'username_set',
    });

    if (error) {
      setIsLoading(false);
      setErrorMessage(error.message);
      return;
    }

    await refreshProfile();
    setIsLoading(false);

    if (isPersonalFlow) {
      router.push({ pathname: '/auth/personal-country', params: { flow: 'personal' } });
      return;
    }

    router.push('/auth/verify-business');
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
            <CloseButton fallback="/auth/choose-account-type" />
            <View style={styles.progressArea}>
              <ProgressIndicator
                totalSteps={
                  isPersonalFlow ? PERSONAL_ONBOARDING_STEP_COUNT : BUSINESS_ONBOARDING_STEP_COUNT
                }
                activeIndex={
                  isPersonalFlow
                    ? PERSONAL_ONBOARDING_PROGRESS.username
                    : BUSINESS_ONBOARDING_PROGRESS.username
                }
              />
            </View>
          </View>

          <AuthTitleBlock
            title="Choose a username"
            subtitle="Used to transact with other users"
            centered
          />

          <LabeledTextInput
            label="Username"
            value={username}
            onChangeText={setUsername}
            placeholder="soundmoneyissou"
            autoCapitalize="none"
            autoCorrect={false}
            showClearButton
          />

          {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

          <View style={styles.buttonArea}>
            <PrimaryButton
              label={isLoading ? 'Saving…' : 'Next'}
              onPress={handleNext}
              disabled={!isUsernameValid || isLoading}
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
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 40,
  },
  progressArea: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
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
