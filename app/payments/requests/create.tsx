import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CurrencySelect } from '@/components/account/currency-select';
import { PrimaryButton } from '@/components/auth/primary-button';
import { InvoiceFormField } from '@/components/payments/invoices/create/invoice-form-field';
import {
  isValidAmount,
  isValidEmail,
} from '@/components/payments/invoices/create/validation';
import { MemoField } from '@/components/payments/requests/memo-field';
import {
  OptionSelectField,
  type SelectOption,
} from '@/components/payments/requests/option-select-field';
import { generatePaymentRequestReferenceId } from '@/components/payments/requests/reference-id';
import { ToggleRow } from '@/components/payments/requests/toggle-row';
import { COLORS } from '@/constants/colors';
import { HachisuColors } from '@/constants/hachisu-colors';
import { DEFAULT_CURRENCY } from '@/constants/currencies';
import { useActiveStore } from '@/contexts/active-store-context';

const EXPIRATION_OPTIONS: readonly SelectOption[] = [
  { id: 'none', label: 'No expiration' },
  { id: '24h', label: '24 hours' },
  { id: '7d', label: '7 days' },
  { id: '30d', label: '30 days' },
];

const CUSTOMER_DATA_OPTIONS: readonly SelectOption[] = [
  { id: 'none', label: 'Do not request any information' },
  { id: 'email', label: 'Request email address only' },
  { id: 'shipping', label: 'Request shipping address' },
];

export default function CreatePaymentRequestScreen() {
  const router = useRouter();
  const { activeStore } = useActiveStore();

  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState(
    activeStore?.default_currency ?? DEFAULT_CURRENCY,
  );
  const [allowCustomAmount, setAllowCustomAmount] = useState(false);
  // Prefill once via a lazy initializer so it never overwrites edits on
  // re-render — only an explicit Regenerate tap replaces it.
  const [referenceId, setReferenceId] = useState(generatePaymentRequestReferenceId);
  const [expirationId, setExpirationId] = useState('none');
  const [customerDataId, setCustomerDataId] = useState('none');
  const [recipientEmail, setRecipientEmail] = useState('');
  const [memo, setMemo] = useState('');

  const amountRequired = !allowCustomAmount;

  // Show an amount error when the field has content that isn't a positive
  // number, or (when required) leave it unmarked until the user engages.
  const amountError =
    amount.length > 0 && !isValidAmount(amount)
      ? 'Enter an amount greater than 0.'
      : null;
  const recipientEmailError =
    recipientEmail.length > 0 && !isValidEmail(recipientEmail)
      ? 'Enter a valid email address.'
      : null;

  const amountValid = amountRequired
    ? isValidAmount(amount)
    : amount.trim().length === 0 || isValidAmount(amount);

  const canSubmit =
    title.trim().length > 0 &&
    currency.length > 0 &&
    amountValid &&
    !recipientEmailError;

  function regenerateReferenceId() {
    setReferenceId(generatePaymentRequestReferenceId());
  }

  function handleCreate() {
    if (!canSubmit) return;
    // Placeholder only — no BTCPay call, no backend, no fake payment link.
    Alert.alert(
      'Create Payment Request',
      'Payment request creation coming soon. This form will create a long-lived Bitcoin payment link for the active store.',
    );
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
          hitSlop={8}>
          <MaterialIcons name="chevron-left" size={24} color={COLORS.primaryText} />
        </Pressable>
        <View style={styles.headerSpacer} />
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <Text style={styles.title}>Create Payment Request</Text>
          {activeStore ? (
            <View style={styles.storeRow}>
              <MaterialIcons name="storefront" size={15} color={COLORS.secondaryText} />
              <Text style={styles.storeName} numberOfLines={1}>
                {activeStore.name}
              </Text>
            </View>
          ) : null}

          {/* Core details */}
          <InvoiceFormField
            label="Title"
            required
            value={title}
            onChangeText={setTitle}
            placeholder="Example: Website design deposit"
            returnKeyType="next"
          />

          <InvoiceFormField
            label="Amount"
            required={amountRequired}
            value={amount}
            onChangeText={setAmount}
            placeholder="0.00"
            keyboardType="decimal-pad"
            returnKeyType="done"
            error={amountError}
            rightSlot={<Text style={styles.currencySuffix}>{currency}</Text>}
          />

          <View style={styles.fieldBlock}>
            <Text style={styles.fieldLabel}>
              Currency <Text style={styles.required}>*</Text>
            </Text>
            <CurrencySelect value={currency} onChange={setCurrency} />
          </View>

          <View style={styles.toggleBlock}>
            <ToggleRow
              label="Allow customer to choose amount"
              description="Useful for donations, tips, or flexible service payments."
              value={allowCustomAmount}
              onValueChange={setAllowCustomAmount}
            />
          </View>

          <InvoiceFormField
            label="Reference ID"
            value={referenceId}
            onChangeText={setReferenceId}
            placeholder="Auto-generated"
            autoCapitalize="characters"
            autoCorrect={false}
          />
          <Pressable
            onPress={regenerateReferenceId}
            style={({ pressed }) => [styles.regenerate, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Regenerate reference ID"
            hitSlop={8}>
            <MaterialIcons name="refresh" size={16} color={HachisuColors.cream} />
            <Text style={styles.regenerateLabel}>Regenerate</Text>
          </Pressable>

          <MemoField value={memo} onChangeText={setMemo} />

          {/* Payment behavior */}
          <Text style={styles.sectionLabel}>PAYMENT BEHAVIOR</Text>
          <OptionSelectField
            label="Expiration"
            options={EXPIRATION_OPTIONS}
            selectedId={expirationId}
            onChange={setExpirationId}
            helperText="Payment requests are long-lived by default."
          />
          <OptionSelectField
            label="Request customer data on checkout"
            options={CUSTOMER_DATA_OPTIONS}
            selectedId={customerDataId}
            onChange={setCustomerDataId}
          />

          {/* Customer */}
          <Text style={styles.sectionLabel}>CUSTOMER</Text>
          <InvoiceFormField
            label="Recipient Email"
            value={recipientEmail}
            onChangeText={setRecipientEmail}
            placeholder="customer@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            error={recipientEmailError}
          />
          <Text style={styles.helperText}>
            Optional. Used for sending the payment request later.
          </Text>

          <View style={styles.createButton}>
            <PrimaryButton
              label="Create Request"
              onPress={handleCreate}
              disabled={!canSubmit}
            />
          </View>
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
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerSpacer: {
    width: 40,
    height: 40,
  },
  pressed: {
    opacity: 0.7,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 48,
  },
  title: {
    fontSize: 30,
    fontWeight: '700',
    color: COLORS.primaryText,
    marginTop: 8,
  },
  storeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
  },
  storeName: {
    flexShrink: 1,
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.secondaryText,
  },
  fieldBlock: {
    marginTop: 18,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.primaryText,
    marginBottom: 8,
  },
  required: {
    color: COLORS.primary,
  },
  currencySuffix: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.secondaryText,
  },
  toggleBlock: {
    marginTop: 18,
  },
  regenerate: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-end',
    marginTop: 10,
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  regenerateLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: HachisuColors.cream,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 1,
    color: COLORS.secondaryText,
    marginTop: 32,
    marginBottom: 4,
  },
  helperText: {
    fontSize: 13,
    color: COLORS.mutedText,
    marginTop: 8,
    lineHeight: 18,
  },
  createButton: {
    marginTop: 32,
  },
});
