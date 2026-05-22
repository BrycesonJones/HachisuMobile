import { useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';

import { AuthTitleBlock } from '@/components/auth/auth-title-block';
import { BackButton } from '@/components/auth/back-button';
import { LabeledTextInput } from '@/components/auth/labeled-text-input';
import { PrimaryButton } from '@/components/auth/primary-button';
import { ScreenContainer } from '@/components/auth/screen-container';
import { isValidEmail } from '@/utils/auth-validation';

export default function BusinessEmailScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const isEmailValid = isValidEmail(email);

  function handleNext() {
    if (!isEmailValid) return;

    router.push({
      pathname: '/auth/business-confirmation',
      params: { email: email.trim() },
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

          <View style={styles.buttonArea}>
            <PrimaryButton label="Next" onPress={handleNext} disabled={!isEmailValid} />
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
  buttonArea: {
    marginTop: 32,
  },
});
