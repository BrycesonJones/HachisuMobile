import { useRouter } from 'expo-router';
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
import { PhoneNumberInput } from '@/components/auth/phone-number-input';
import { PrimaryButton } from '@/components/auth/primary-button';
import { ScreenContainer } from '@/components/auth/screen-container';
import { COLORS } from '@/constants/colors';
import { useAuth } from '@/contexts/auth-context';
import { upsertUserProfile } from '@/lib/auth/auth-service';
import { isValidPhone } from '@/utils/auth-validation';

export default function EditPhoneScreen() {
  const router = useRouter();
  const { profile, refreshProfile } = useAuth();
  const [draft, setDraft] = useState(profile?.phone ?? '');
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isPhoneValid = isValidPhone(draft);

  async function handleSave() {
    if (!isPhoneValid || isSaving) return;
    setIsSaving(true);
    setErrorMessage(null);

    // TODO: send a confirmation code via Supabase / SMS provider before saving in production.
    const { error } = await upsertUserProfile({ phone: draft.trim() });

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
            title="Enter your phone number"
            subtitle="A way to reach you about your account"
            centered
          />

          <PhoneNumberInput
            label="Your phone number"
            value={draft}
            onChangeText={setDraft}
            placeholder="201-555-0123"
          />

          {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

          <View style={styles.buttonArea}>
            <PrimaryButton
              label={isSaving ? 'Saving…' : 'Save'}
              onPress={handleSave}
              disabled={!isPhoneValid || isSaving}
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
