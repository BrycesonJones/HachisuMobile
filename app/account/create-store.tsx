import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CurrencySelect } from '@/components/account/currency-select';
import { COLORS } from '@/constants/colors';
import { DEFAULT_CURRENCY } from '@/constants/currencies';
import { createMerchantStore } from '@/lib/btcpay/stores';

const NAME_MAX = 50;

// Configure-then-create flow. Tapping Create Store on the Wallet screen lands
// here; the BTCPay store is only provisioned once the merchant submits.
export default function CreateStoreScreen() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [currency, setCurrency] = useState(DEFAULT_CURRENCY);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const trimmedName = name.trim();
  const canSubmit = trimmedName.length > 0 && !submitting;

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setErrorMessage(null);

    const { error } = await createMerchantStore({ name: trimmedName, defaultCurrency: currency });

    if (error) {
      setErrorMessage(error);
      setSubmitting(false);
      return;
    }
    // Success — go back; the previous screen refetches its store list on focus.
    setSubmitting(false);
    router.back();
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="light-content" />

      <View style={styles.headerRow}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={10}>
          <MaterialIcons name="chevron-left" size={24} color={COLORS.primaryText} />
          <Text style={styles.backLabel}>Back</Text>
        </Pressable>
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>Create Store</Text>

          {/* Name */}
          <Text style={styles.label}>
            Name <Text style={styles.required}>*</Text>
          </Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Bryceson LLC - Atlanta"
            placeholderTextColor={COLORS.mutedText}
            style={styles.input}
            maxLength={NAME_MAX}
            autoCapitalize="words"
            returnKeyType="done"
            editable={!submitting}
          />

          {/* Default Currency */}
          <Text style={styles.label}>
            Default Currency <Text style={styles.required}>*</Text>
          </Text>
          <CurrencySelect value={currency} onChange={setCurrency} />

          {/* Preferred Price Source (read-only) */}
          <Text style={styles.label}>Preferred Price Source</Text>
          <View style={styles.readonlyField}>
            <Text style={styles.readonlyValue}>Recommendation (Kraken)</Text>
          </View>
          <Text style={styles.helperText}>
            Hachisu uses Kraken pricing recommendations for simple, consistent BTC conversion.
          </Text>

          {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

          <Pressable
            onPress={handleSubmit}
            disabled={!canSubmit}
            style={({ pressed }) => [
              styles.submitButton,
              !canSubmit && styles.submitButtonDisabled,
              pressed && canSubmit && styles.submitButtonPressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Create Store">
            {submitting ? (
              <View style={styles.submitInner}>
                <ActivityIndicator color={COLORS.background} />
                <Text style={styles.submitText}>Creating Store…</Text>
              </View>
            ) : (
              <Text style={styles.submitText}>Create Store</Text>
            )}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  flex: {
    flex: 1,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 8,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 40,
    paddingRight: 14,
    paddingLeft: 4,
  },
  backLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: COLORS.primaryText,
    marginLeft: 2,
  },
  pressed: {
    opacity: 0.6,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  title: {
    fontSize: 28,
    fontWeight: '600',
    color: COLORS.primaryText,
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.primaryText,
    marginTop: 18,
    marginBottom: 8,
  },
  required: {
    color: COLORS.primary,
  },
  input: {
    height: 52,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.cardBorder,
    backgroundColor: COLORS.cardAlt,
    color: COLORS.primaryText,
    fontSize: 16,
  },
  readonlyField: {
    height: 52,
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.cardBorder,
    backgroundColor: COLORS.card,
  },
  readonlyValue: {
    fontSize: 16,
    color: COLORS.secondaryText,
  },
  helperText: {
    fontSize: 13,
    color: COLORS.mutedText,
    marginTop: 8,
    lineHeight: 18,
  },
  errorText: {
    marginTop: 18,
    fontSize: 13,
    color: '#F87171',
    lineHeight: 18,
  },
  submitButton: {
    marginTop: 28,
    height: 52,
    borderRadius: 12,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitButtonDisabled: {
    backgroundColor: COLORS.disabled,
  },
  submitButtonPressed: {
    opacity: 0.85,
  },
  submitInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  submitText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.background,
  },
});
