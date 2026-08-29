import { useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';

import { AuthProgressHeader } from '@/components/auth/auth-progress-header';
import { AuthTitleBlock } from '@/components/auth/auth-title-block';
import { PhoneNumberInput } from '@/components/auth/phone-number-input';
import { PrimaryButton } from '@/components/auth/primary-button';
import { ScreenContainer } from '@/components/auth/screen-container';
import {
  PERSONAL_ONBOARDING_PROGRESS,
  PERSONAL_ONBOARDING_STEP_COUNT,
} from '@/constants/personal-onboarding-progress';
import { isValidPhone } from '@/utils/auth-validation';

export default function PersonalPhoneScreen() {
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const isPhoneValid = isValidPhone(phone);

  // Plain profile-information collection: Hachisu has no SMS infrastructure,
  // so there is no verification step — the number rides the flow as a param
  // and is saved to the profile when onboarding completes.
  function handleNext() {
    if (!isPhoneValid) return;
    router.push({
      pathname: '/auth/verify-personal',
      params: { phone },
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
            placeholder="201-555-0123"
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
});
