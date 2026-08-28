import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { AuthTitleBlock } from '@/components/auth/auth-title-block';
import { CloseButton } from '@/components/auth/close-button';
import { LabeledTextInput } from '@/components/auth/labeled-text-input';
import { PrimaryButton } from '@/components/auth/primary-button';
import { ScreenContainer } from '@/components/auth/screen-container';
import { COLORS } from '@/constants/colors';
import { useAuth } from '@/contexts/auth-context';
import { upsertUserProfile } from '@/lib/auth/auth-service';
import type { UserProfile } from '@/types/user-profile';

// One edit screen per business-information field, selected by the `field`
// route param. Each field maps to exactly one user_profiles column — the same
// columns business onboarding writes — and mirrors onboarding's input behavior
// and validation (required vs optional; no extra constraints onboarding
// doesn't have). Business name is profile-only: nothing here renames
// merchant_stores or the BTCPay store.
type EditableField = 'name' | 'address' | 'website' | 'country' | 'description' | 'volume';

interface FieldConfig {
  column: keyof Pick<
    UserProfile,
    | 'business_name'
    | 'business_address'
    | 'business_website'
    | 'business_country'
    | 'business_description'
    | 'expected_monthly_volume'
  >;
  title: string;
  inputLabel: string;
  placeholder: string;
  /** Optional fields save an empty draft as null and display "Not provided". */
  required: boolean;
  multiline?: boolean;
  autoCapitalize?: 'none' | 'sentences' | 'words';
  keyboardType?: 'default' | 'url';
}

const FIELD_CONFIGS: Record<EditableField, FieldConfig> = {
  name: {
    column: 'business_name',
    title: 'Edit business name',
    inputLabel: 'Legal entity name',
    placeholder: 'Hachisu Technologies LLC',
    required: true,
    autoCapitalize: 'words',
  },
  address: {
    column: 'business_address',
    title: 'Edit business address',
    inputLabel: 'Business address',
    placeholder: '123 Main Street, Suite 200, Atlanta, GA 30301',
    required: true,
    multiline: true,
    autoCapitalize: 'words',
  },
  website: {
    column: 'business_website',
    title: 'Edit business website',
    inputLabel: 'Business website (optional)',
    placeholder: 'https://hachisu.com',
    required: false,
    autoCapitalize: 'none',
    keyboardType: 'url',
  },
  country: {
    column: 'business_country',
    title: 'Edit country',
    inputLabel: 'Business country',
    placeholder: 'United States',
    required: true,
    autoCapitalize: 'words',
  },
  description: {
    column: 'business_description',
    title: 'Edit business description',
    inputLabel: 'What does your business do?',
    placeholder: 'We sell specialty coffee online and in our Atlanta cafe.',
    required: true,
    multiline: true,
    autoCapitalize: 'sentences',
  },
  volume: {
    column: 'expected_monthly_volume',
    title: 'Edit expected monthly volume',
    inputLabel: 'Expected monthly payment volume',
    placeholder: '$5,000 – $10,000',
    required: true,
    autoCapitalize: 'none',
  },
};

function isEditableField(value: string | undefined): value is EditableField {
  return typeof value === 'string' && value in FIELD_CONFIGS;
}

export default function EditBusinessFieldScreen() {
  const router = useRouter();
  const { profile, refreshProfile } = useAuth();
  const { field } = useLocalSearchParams<{ field?: string }>();

  const config = isEditableField(field) ? FIELD_CONFIGS[field] : null;

  const [draft, setDraft] = useState(() =>
    config ? ((profile?.[config.column] as string | null) ?? '') : '',
  );
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!config) {
    return <Redirect href="/account/business-profile" />;
  }

  const trimmed = draft.trim();
  const canSave = config.required ? trimmed.length > 0 : true;

  async function handleSave() {
    if (!config || !canSave || isSaving) return;
    setIsSaving(true);
    setErrorMessage(null);

    const { error } = await upsertUserProfile({
      [config.column]: config.required ? trimmed : trimmed || null,
    });

    if (error) {
      setIsSaving(false);
      setErrorMessage(error.message);
      return;
    }

    await refreshProfile();
    setIsSaving(false);
    router.back();
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
            <CloseButton onPress={() => router.back()} />
          </View>

          <AuthTitleBlock
            title={config.title}
            subtitle={
              config.required
                ? 'This updates your business information'
                : 'Leave blank if you don’t have one'
            }
            centered
          />

          <LabeledTextInput
            label={config.inputLabel}
            value={draft}
            onChangeText={setDraft}
            placeholder={config.placeholder}
            autoCapitalize={config.autoCapitalize ?? 'sentences'}
            autoCorrect={false}
            keyboardType={config.keyboardType ?? 'default'}
            multiline={config.multiline}
          />

          {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

          <View style={styles.buttonArea}>
            <PrimaryButton
              label={isSaving ? 'Saving…' : 'Save'}
              onPress={handleSave}
              disabled={!canSave || isSaving}
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
    alignItems: 'flex-start',
  },
  errorText: {
    marginTop: 12,
    fontSize: 14,
    color: COLORS.orange,
    textAlign: 'center',
  },
  buttonArea: {
    marginTop: 32,
  },
});
