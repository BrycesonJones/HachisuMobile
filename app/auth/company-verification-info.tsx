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
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BackButton } from '@/components/auth/back-button';
import { AuthTitleBlock } from '@/components/auth/auth-title-block';
import { LabeledTextInput } from '@/components/auth/labeled-text-input';
import { PrimaryButton } from '@/components/auth/primary-button';
import { ScreenContainer } from '@/components/auth/screen-container';
import { COLORS } from '@/constants/colors';
import {
  formatEinInput,
  isCompanyVerificationFormValid,
  type CompanyVerificationForm,
} from '@/lib/company-verification';

// TODO: Connect EIN and business information to production KYB provider.

const INITIAL_FORM: CompanyVerificationForm = {
  companyName: '',
  streetAddress: '',
  suite: '',
  city: '',
  state: '',
  zipCode: '',
  ein: '',
};

export default function CompanyVerificationInfoScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [form, setForm] = useState<CompanyVerificationForm>(INITIAL_FORM);

  const isFormValid = useMemo(() => isCompanyVerificationFormValid(form), [form]);

  function updateField<K extends keyof CompanyVerificationForm>(
    field: K,
    value: CompanyVerificationForm[K],
  ) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function handleEinChange(value: string) {
    updateField('ein', formatEinInput(value));
  }

  function handleContinue() {
    if (!isFormValid) return;
    router.replace('/(tabs)/home');
  }

  return (
    <ScreenContainer style={styles.screen}>
      <KeyboardAvoidingView
        style={styles.keyboardAvoidingView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top : 0}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: 96 + insets.bottom },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
          nestedScrollEnabled={true}>
          <View style={styles.header}>
            <BackButton />
          </View>

          <AuthTitleBlock
            title="Company information"
            subtitle="Enter the information required to verify your business."
          />

          <Text style={styles.helperIntro}>
            This information helps us verify your business and protect your account.
          </Text>

          <View style={styles.form}>
            <LabeledTextInput
              label="Legal company name"
              value={form.companyName}
              onChangeText={(value) => updateField('companyName', value)}
              placeholder="Hachisu Technologies LLC"
              autoCapitalize="words"
              autoCorrect={false}
            />
            <LabeledTextInput
              label="Business street address"
              value={form.streetAddress}
              onChangeText={(value) => updateField('streetAddress', value)}
              placeholder="123 Main Street"
              autoCapitalize="words"
              autoCorrect={false}
            />
            <LabeledTextInput
              label="Suite, unit, etc. optional"
              value={form.suite}
              onChangeText={(value) => updateField('suite', value)}
              placeholder="Suite 200"
              autoCapitalize="words"
              autoCorrect={false}
            />
            <LabeledTextInput
              label="City"
              value={form.city}
              onChangeText={(value) => updateField('city', value)}
              placeholder="Atlanta"
              autoCapitalize="words"
              autoCorrect={false}
            />
            <LabeledTextInput
              label="State"
              value={form.state}
              onChangeText={(value) => updateField('state', value)}
              placeholder="GA"
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={2}
            />
            <LabeledTextInput
              label="ZIP code"
              value={form.zipCode}
              onChangeText={(value) => updateField('zipCode', value.replace(/\D/g, '').slice(0, 10))}
              placeholder="30301"
              keyboardType="number-pad"
              maxLength={10}
            />
            <View>
              <LabeledTextInput
                label="Employer Identification Number"
                value={form.ein}
                onChangeText={handleEinChange}
                placeholder="12-3456789"
                keyboardType="number-pad"
                maxLength={10}
              />
              <Text style={styles.fieldHelper}>Used only for business verification.</Text>
            </View>
          </View>

          <Text style={styles.securityNote}>
            Your business information is used for verification and account security.
          </Text>

          <View style={styles.buttonArea}>
            <PrimaryButton label="Continue" onPress={handleContinue} disabled={!isFormValid} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  keyboardAvoidingView: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {},
  header: {
    paddingTop: 8,
    paddingBottom: 24,
  },
  helperIntro: {
    fontSize: 14,
    lineHeight: 20,
    color: COLORS.secondaryText,
    marginTop: -16,
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
    marginTop: 20,
    marginBottom: 8,
  },
  buttonArea: {
    marginTop: 16,
  },
});
