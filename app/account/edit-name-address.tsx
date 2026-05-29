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
import { CloseButton } from '@/components/auth/close-button';
import { LabeledTextInput } from '@/components/auth/labeled-text-input';
import { PrimaryButton } from '@/components/auth/primary-button';
import { COLORS } from '@/constants/colors';
import { useAuth } from '@/contexts/auth-context';
import { nameAndAddressToPersonalAddress } from '@/contexts/profile-extras-context';
import { upsertUserProfile } from '@/lib/auth/auth-service';
import { isNonEmpty, isValidZip } from '@/utils/auth-validation';

export default function EditNameAddressScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { profile, refreshProfile } = useAuth();

  const [fullName, setFullName] = useState(profile?.full_name ?? '');
  const [streetAddress, setStreetAddress] = useState('');
  const [apartment, setApartment] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [country, setCountry] = useState(profile?.country ?? 'United States');
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isFormValid = useMemo(
    () =>
      isNonEmpty(fullName) &&
      isNonEmpty(streetAddress) &&
      isNonEmpty(city) &&
      isNonEmpty(state) &&
      isValidZip(postalCode) &&
      isNonEmpty(country),
    [fullName, streetAddress, city, state, postalCode, country],
  );

  async function handleSave() {
    if (!isFormValid || isSaving) return;
    setIsSaving(true);
    setErrorMessage(null);

    const personalAddress = nameAndAddressToPersonalAddress({
      fullName,
      streetAddress,
      apartment,
      city,
      state,
      postalCode,
      country,
    });

    const { error } = await upsertUserProfile({
      full_name: fullName.trim(),
      personal_address: personalAddress,
      country: country.trim() || 'United States',
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
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top : 0}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: 120 + insets.bottom },
          ]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <CloseButton onPress={() => router.back()} />
          </View>

          <AuthTitleBlock
            title="Name & address"
            subtitle="Update the name and address on your account"
            centered
          />

          <View style={styles.form}>
            <LabeledTextInput
              label="Full name"
              value={fullName}
              onChangeText={setFullName}
              placeholder="Satoshi Nakamoto"
              autoCapitalize="words"
              autoCorrect={false}
            />
            <LabeledTextInput
              label="Street address"
              value={streetAddress}
              onChangeText={setStreetAddress}
              placeholder="123 Main Street"
              autoCapitalize="words"
            />
            <LabeledTextInput
              label="Apartment, suite, etc. (optional)"
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
              value={postalCode}
              onChangeText={setPostalCode}
              placeholder="30301"
              keyboardType="number-pad"
              maxLength={10}
            />
            <LabeledTextInput
              label="Country"
              value={country}
              onChangeText={setCountry}
              placeholder="United States"
              autoCapitalize="words"
            />
          </View>

          {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

          <View style={styles.buttonArea}>
            <PrimaryButton
              label={isSaving ? 'Saving…' : 'Save'}
              onPress={handleSave}
              disabled={!isFormValid || isSaving}
            />
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
  flex: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 8,
  },
  header: {
    paddingBottom: 24,
    alignItems: 'flex-start',
  },
  form: {
    gap: 12,
  },
  errorText: {
    marginTop: 12,
    fontSize: 14,
    color: COLORS.orange,
    textAlign: 'center',
  },
  buttonArea: {
    marginTop: 28,
  },
});
