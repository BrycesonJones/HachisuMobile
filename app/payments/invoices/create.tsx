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
import { CollapsibleSection } from '@/components/payments/invoices/create/collapsible-section';
import { InvoiceFormField } from '@/components/payments/invoices/create/invoice-form-field';
import { generateInvoiceOrderId } from '@/components/payments/invoices/create/order-id';
import {
  SupportedPaymentMethods,
  type TransactionCurrencyKey,
  type TransactionCurrencySelection,
} from '@/components/payments/invoices/create/supported-payment-methods';
import {
  isValidAmount,
  isValidEmail,
  looksLikeUrl,
} from '@/components/payments/invoices/create/validation';
import { COLORS } from '@/constants/colors';
import { HachisuColors } from '@/constants/hachisu-colors';
import { DEFAULT_CURRENCY } from '@/constants/currencies';
import { useActiveStore } from '@/contexts/active-store-context';

export default function CreateInvoiceScreen() {
  const router = useRouter();
  const { activeStore } = useActiveStore();

  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState(
    activeStore?.default_currency ?? DEFAULT_CURRENCY,
  );
  // Prefill once on mount via a lazy initializer so the generated value is never
  // recomputed on re-render — i.e. it won't overwrite the user's edits. Only an
  // explicit Regenerate tap replaces it.
  const [orderId, setOrderId] = useState(generateInvoiceOrderId);
  const [itemDescription, setItemDescription] = useState('');
  const [buyerEmail, setBuyerEmail] = useState('');
  const [notificationUrl, setNotificationUrl] = useState('');
  const [notificationEmail, setNotificationEmail] = useState('');
  const [transactionCurrencies, setTransactionCurrencies] =
    useState<TransactionCurrencySelection>({ lightning: true, onchain: true });

  function toggleTransactionCurrency(key: TransactionCurrencyKey) {
    setTransactionCurrencies((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function regenerateOrderId() {
    setOrderId(generateInvoiceOrderId());
  }

  // Validate optional fields only when the user has typed something.
  const amountError =
    amount.length > 0 && !isValidAmount(amount)
      ? 'Enter an amount greater than 0.'
      : null;
  const buyerEmailError =
    buyerEmail.length > 0 && !isValidEmail(buyerEmail)
      ? 'Enter a valid email address.'
      : null;
  const notificationEmailError =
    notificationEmail.length > 0 && !isValidEmail(notificationEmail)
      ? 'Enter a valid email address.'
      : null;
  const notificationUrlError =
    notificationUrl.length > 0 && !looksLikeUrl(notificationUrl)
      ? 'Enter a valid URL (https://…).'
      : null;

  const hasTransactionCurrency =
    transactionCurrencies.lightning || transactionCurrencies.onchain;

  const canSubmit =
    isValidAmount(amount) &&
    currency.length > 0 &&
    hasTransactionCurrency &&
    !buyerEmailError &&
    !notificationEmailError &&
    !notificationUrlError;

  function handleCreate() {
    if (!canSubmit) return;
    // Placeholder only — no Greenfield call, no backend, no fake invoice id.
    Alert.alert(
      'Create Invoice',
      'Invoice creation coming soon. This form will create a Bitcoin invoice for the active store.',
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
          <Text style={styles.title}>Create Invoice</Text>
          {activeStore ? (
            <View style={styles.storeRow}>
              <MaterialIcons
                name="storefront"
                size={15}
                color={COLORS.secondaryText}
              />
              <Text style={styles.storeName} numberOfLines={1}>
                {activeStore.name}
              </Text>
            </View>
          ) : null}

          {/* Invoice details */}
          <InvoiceFormField
            label="Amount"
            required
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

          <InvoiceFormField
            label="Order ID"
            value={orderId}
            onChangeText={setOrderId}
            placeholder="Optional order ID"
            autoCapitalize="characters"
            autoCorrect={false}
          />
          <Pressable
            onPress={regenerateOrderId}
            style={({ pressed }) => [styles.regenerate, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Regenerate order ID"
            hitSlop={8}>
            <MaterialIcons name="refresh" size={16} color={HachisuColors.cream} />
            <Text style={styles.regenerateLabel}>Regenerate</Text>
          </Pressable>

          <InvoiceFormField
            label="Item Description"
            value={itemDescription}
            onChangeText={setItemDescription}
            placeholder="What is this invoice for?"
          />

          {/* Supported transaction currencies (selectable) */}
          <Text style={styles.sectionLabel}>SUPPORTED TRANSACTION CURRENCIES</Text>
          <SupportedPaymentMethods
            selection={transactionCurrencies}
            onToggle={toggleTransactionCurrency}
          />
          {!hasTransactionCurrency ? (
            <Text style={styles.inlineError}>Select at least one transaction currency.</Text>
          ) : null}

          {/* Customer information */}
          <Text style={styles.sectionLabel}>CUSTOMER INFORMATION</Text>
          <InvoiceFormField
            label="Buyer Email"
            value={buyerEmail}
            onChangeText={setBuyerEmail}
            placeholder="customer@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            error={buyerEmailError}
          />

          {/* Invoice notifications (collapsible, optional) */}
          <View style={styles.notificationsBlock}>
            <CollapsibleSection title="Invoice Notifications">
              <InvoiceFormField
                label="Notification URL"
                value={notificationUrl}
                onChangeText={setNotificationUrl}
                placeholder="https://example.com/webhook"
                keyboardType="url"
                autoCapitalize="none"
                autoCorrect={false}
                error={notificationUrlError}
              />
              <InvoiceFormField
                label="Notification Email"
                value={notificationEmail}
                onChangeText={setNotificationEmail}
                placeholder="notifications@example.com"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                error={notificationEmailError}
              />
              <Text style={styles.helperText}>Receive updates for this invoice.</Text>
            </CollapsibleSection>
          </View>

          <View style={styles.createButton}>
            <PrimaryButton
              label="Create Invoice"
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
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 1,
    color: COLORS.secondaryText,
    marginTop: 32,
    marginBottom: 12,
  },
  inlineError: {
    marginTop: 10,
    fontSize: 13,
    color: '#F87171',
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
  notificationsBlock: {
    marginTop: 24,
  },
  createButton: {
    marginTop: 32,
  },
  helperText: {
    fontSize: 13,
    color: COLORS.mutedText,
    marginTop: 16,
  },
});
