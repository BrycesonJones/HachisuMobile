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
import { useAuth } from '@/contexts/auth-context';
import { saveOnboardingProfile } from '@/lib/auth/auth-service';
import {
  getStagedCompanyVerificationForm,
  stageCompanyVerificationForm,
} from '@/lib/auth/onboarding-draft';
import {
  INITIAL_COMPANY_VERIFICATION_FORM,
  isCompanyVerificationFormValid,
  type CompanyVerificationForm,
} from '@/lib/company-verification';

export default function CompanyVerificationInfoScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { refreshProfile } = useAuth();
  // Restores what was typed if the screen is remounted after moving on to the
  // email step (going back keeps the mounted screen, so this is a safety net).
  const [form, setForm] = useState<CompanyVerificationForm>(
    () => getStagedCompanyVerificationForm() ?? INITIAL_COMPANY_VERIFICATION_FORM,
  );
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isFormValid = useMemo(() => isCompanyVerificationFormValid(form), [form]);

  function updateField<K extends keyof CompanyVerificationForm>(
    field: K,
    value: CompanyVerificationForm[K],
  ) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleContinue() {
    if (!isFormValid || isSaving) return;

    setIsSaving(true);
    setErrorMessage(null);

    const { error, staged } = await saveOnboardingProfile(
      {
        account_type: 'business',
        business_name: form.companyName.trim(),
        business_address: form.businessAddress.trim(),
        business_website: form.businessWebsite.trim() || null,
        business_country: form.businessCountry.trim(),
        business_description: form.businessDescription.trim(),
        expected_monthly_volume: form.expectedMonthlyVolume.trim(),
      },
      { completesOnboarding: true },
    );

    if (error) {
      setIsSaving(false);
      setErrorMessage(error.message);
      return;
    }

    setIsSaving(false);

    // This is the last questionnaire screen. A new merchant signs up now — the
    // staged answers are written once the email is verified. A user who is
    // already signed in (resuming onboarding) has just been saved and is done.
    if (staged) {
      stageCompanyVerificationForm(form);
      router.push('/auth/business-email');
      return;
    }

    await refreshProfile();
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
            subtitle="Tell us about your business so we can set up your merchant account."
          />

          <Text style={styles.helperIntro}>
            This information appears on your Profile Hub and helps us tailor your account.
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
              label="Business address"
              value={form.businessAddress}
              onChangeText={(value) => updateField('businessAddress', value)}
              placeholder="123 Main Street, Suite 200, Atlanta, GA 30301"
              autoCapitalize="words"
              autoCorrect={false}
              multiline
            />
            <LabeledTextInput
              label="Business website (optional)"
              value={form.businessWebsite}
              onChangeText={(value) => updateField('businessWebsite', value.trim())}
              placeholder="https://hachisu.com"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />
            <LabeledTextInput
              label="Business country"
              value={form.businessCountry}
              onChangeText={(value) => updateField('businessCountry', value)}
              placeholder="United States"
              autoCapitalize="words"
              autoCorrect={false}
            />
            <LabeledTextInput
              label="What does your business do?"
              value={form.businessDescription}
              onChangeText={(value) => updateField('businessDescription', value)}
              placeholder="We sell specialty coffee online and in our Atlanta cafe."
              autoCapitalize="sentences"
              multiline
            />
            <LabeledTextInput
              label="Expected monthly payment volume"
              value={form.expectedMonthlyVolume}
              onChangeText={(value) => updateField('expectedMonthlyVolume', value)}
              placeholder="$5,000 – $10,000"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

          <Text style={styles.securityNote}>
            You can update these details later from your Profile Hub.
          </Text>

          <View style={styles.buttonArea}>
            <PrimaryButton
              label={isSaving ? 'Saving…' : 'Continue'}
              onPress={handleContinue}
              disabled={!isFormValid || isSaving}
            />
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
  errorText: {
    marginTop: 16,
    fontSize: 14,
    color: COLORS.orange,
    textAlign: 'center',
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
