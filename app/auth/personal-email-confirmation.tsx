import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AuthTitleBlock } from '@/components/auth/auth-title-block';
import { BackButton } from '@/components/auth/back-button';
import { OtpInputPlaceholder } from '@/components/auth/otp-input-placeholder';
import { PrimaryButton } from '@/components/auth/primary-button';
import { ScreenContainer } from '@/components/auth/screen-container';
import { COLORS } from '@/constants/colors';

const CODE_LENGTH = 6;

export default function PersonalEmailConfirmationScreen() {
  const router = useRouter();
  const { email } = useLocalSearchParams<{ email?: string }>();
  const [code, setCode] = useState('');

  const displayEmail = typeof email === 'string' && email.length > 0 ? email : 'your email';
  const isCodeComplete = code.length === CODE_LENGTH;

  function handleNext() {
    if (!isCodeComplete) return;
    router.push({ pathname: '/auth/choose-username', params: { flow: 'personal' } });
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
            title="Enter confirmation code"
            subtitle={`We sent a code to ${displayEmail}`}
            centered
          />

          <OtpInputPlaceholder value={code} onChange={setCode} length={CODE_LENGTH} />

          <Text style={styles.helperText}>Verification will be enabled later.</Text>

          <View style={styles.buttonArea}>
            <PrimaryButton label="Next" onPress={handleNext} disabled={!isCodeComplete} />
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
  buttonArea: {
    marginTop: 32,
  },
});
