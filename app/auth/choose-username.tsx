import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';

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
import {
  PERSONAL_ONBOARDING_PROGRESS,
  PERSONAL_ONBOARDING_STEP_COUNT,
} from '@/constants/personal-onboarding-progress';

export default function ChooseUsernameScreen() {
  const router = useRouter();
  const { flow } = useLocalSearchParams<{ flow?: string }>();
  const [username, setUsername] = useState('');
  const isUsernameValid = username.trim().length > 0;
  const isPersonalFlow = flow === 'personal';

  function handleNext() {
    if (!isUsernameValid) return;

    if (isPersonalFlow) {
      router.push({ pathname: '/auth/push-notifications', params: { flow: 'personal' } });
      return;
    }

    router.push('/auth/push-notifications');
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
            <CloseButton />
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

          <View style={styles.buttonArea}>
            <PrimaryButton label="Next" onPress={handleNext} disabled={!isUsernameValid} />
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
  buttonArea: {
    marginTop: 32,
  },
});
