import { useRouter } from 'expo-router';
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
import { COLORS } from '@/constants/colors';
import {
  formatDateOfBirthInput,
  formatSsnLast4Input,
  isNonEmpty,
  isValidDateOfBirth,
  isValidSsnLast4,
  isValidZip,
} from '@/utils/auth-validation';

// TODO: Confirm whether full SSN or last 4 SSN is required for production KYC provider.

export default function PersonalVerificationInfoScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [fullName, setFullName] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [streetAddress, setStreetAddress] = useState('');
  const [apartment, setApartment] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [zipCode, setZipCode] = useState('');
  const [ssnLast4, setSsnLast4] = useState('');

  const isFormValid = useMemo(
    () =>
      isNonEmpty(fullName) &&
      isValidDateOfBirth(dateOfBirth) &&
      isNonEmpty(streetAddress) &&
      isNonEmpty(city) &&
      isNonEmpty(state) &&
      isValidZip(zipCode) &&
      isValidSsnLast4(ssnLast4),
    [fullName, dateOfBirth, streetAddress, city, state, zipCode, ssnLast4],
  );

  function handleDateOfBirthChange(value: string) {
    setDateOfBirth(formatDateOfBirthInput(value));
  }

  function handleSsnChange(value: string) {
    setSsnLast4(formatSsnLast4Input(value));
  }

  function handleContinue() {
    if (!isFormValid) return;
    router.replace('/(tabs)/home');
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
              <View>
                <LabeledTextInput
                  label="Last 4 digits of SSN"
                  value={ssnLast4}
                  onChangeText={handleSsnChange}
                  placeholder="1234"
                  keyboardType="number-pad"
                  secureTextEntry
                  maxLength={4}
                />
                <Text style={styles.fieldHelper}>Used only for identity verification.</Text>
              </View>
            </View>

            <Text style={styles.securityNote}>
              Your information is used for identity verification and account security.
            </Text>

            <View style={styles.buttonContainer}>
              <PrimaryButton label="Continue" onPress={handleContinue} disabled={!isFormValid} />
            </View>
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
  fieldHelper: {
    fontSize: 13,
    color: COLORS.mutedText,
    marginTop: 8,
    paddingHorizontal: 4,
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
});
