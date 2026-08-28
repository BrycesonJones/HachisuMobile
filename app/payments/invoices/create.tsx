import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import {
  ActivityIndicator,
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
import { generateInvoiceOrderId } from '@/components/payments/invoices/create/order-id';
import {
  SupportedPaymentMethods,
  type TransactionCurrencyKey,
  type TransactionCurrencySelection,
} from '@/components/payments/invoices/create/supported-payment-methods';
import {
  isValidAmount,
  isValidEmail,
} from '@/components/payments/invoices/create/validation';
import { COLORS } from '@/constants/colors';
import { LIGHTNING_ENABLED } from '@/constants/feature-flags';
import { HachisuColors } from '@/constants/hachisu-colors';
import { DEFAULT_CURRENCY } from '@/constants/currencies';
import { useActiveStore } from '@/contexts/active-store-context';
import { markStoreActivityStale, seedCreatedInvoice } from '@/lib/btcpay/activity-cache';
import {
  createInvoice,
  newInvoiceIdempotencyKey,
  type CreateInvoiceErrorCode,
  type InvoicePaymentRail,
} from '@/lib/btcpay/invoices';

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
  // Lightning defaults on only when the product gate is open; while gated it can
  // never be selected (the selector row is inert and the toggle below ignores it).
  const [transactionCurrencies, setTransactionCurrencies] =
    useState<TransactionCurrencySelection>({ lightning: LIGHTNING_ENABLED, onchain: true });

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitErrorCode, setSubmitErrorCode] = useState<CreateInvoiceErrorCode | null>(null);
  /** Set once BTCPay holds a real invoice for this form, INCLUDING the
   * created-but-unsynced case — it is what stops a second create. */
  const [createdInvoiceId, setCreatedInvoiceId] = useState<string | null>(null);

  // Refs, not state: these must be correct within a single tap, before re-render.
  const submittingRef = useRef(false);
  const idempotencyKeyRef = useRef<string | null>(null);

  function toggleTransactionCurrency(key: TransactionCurrencyKey) {
    if (key === 'lightning' && !LIGHTNING_ENABLED) return;
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

  const hasTransactionCurrency =
    transactionCurrencies.lightning || transactionCurrencies.onchain;

  const formValid =
    isValidAmount(amount) &&
    currency.length > 0 &&
    hasTransactionCurrency &&
    !buyerEmailError;

  const canSubmit = formValid && !!activeStore && !submitting && !createdInvoiceId;

  /**
   * Creates the invoice for real: one Edge Function call that authenticates the
   * merchant, resolves this store's BTCPay id server-side, creates the invoice in
   * BTCPay, records it, and returns the normalized result.
   *
   * Duplicate protection is layered. The button is disabled while submitting and
   * a ref rejects a tap that lands before React re-renders, but the AUTHORITATIVE
   * guarantee is the server's unique (store, idempotency key) row — so a retry of
   * this same attempt returns the SAME invoice instead of creating a second one.
   */
  async function handleCreate() {
    if (!canSubmit || !activeStore) return;
    if (submittingRef.current) return; // Beats the re-render on a fast double tap.
    submittingRef.current = true;

    // One key per submission ATTEMPT, reused across retries of that attempt.
    if (!idempotencyKeyRef.current) {
      idempotencyKeyRef.current = newInvoiceIdempotencyKey();
    }

    const rails: InvoicePaymentRail[] = [];
    if (transactionCurrencies.onchain) rails.push('onchain');
    // Gate check here too: even if state were ever wrong, a gated build must
    // never request the lightning rail from the backend.
    if (LIGHTNING_ENABLED && transactionCurrencies.lightning) rails.push('lightning');

    setSubmitting(true);
    setSubmitError(null);
    setSubmitErrorCode(null);

    try {
      const result = await createInvoice({
        merchantStoreId: activeStore.id,
        idempotencyKey: idempotencyKeyRef.current,
        amount: amount.trim(),
        currency,
        description: itemDescription,
        orderId,
        buyerEmail,
        paymentRails: rails,
      });

      if (result.ok) {
        // The invoice exists in BTCPay. Retire this attempt's key so a later
        // invoice from this screen can never collide with it.
        idempotencyKeyRef.current = null;
        setCreatedInvoiceId(result.invoice.btcpayInvoiceId);

        // Seed the detail cache from the authoritative create response so the
        // Payment Details screen paints — and can share the checkout URL —
        // without a second round-trip for data we already hold. The screen still
        // fetches the authoritative record and overwrites this.
        seedCreatedInvoice(activeStore.id, result.invoice);

        // Feed the invoice into the EXISTING Activity pipeline (it re-fetches
        // from the backend; nothing is synthesized locally).
        markStoreActivityStale(activeStore.id);

        router.replace({
          pathname: '/activity-details',
          params: {
            merchantStoreId: activeStore.id,
            invoiceId: result.invoice.btcpayInvoiceId,
            source: 'invoice',
          },
        });
        return;
      }

      // Created in BTCPay but not synced locally: the invoice is REAL. Keep the
      // form intact, surface a recovery path, and never invite a second create.
      if (result.code === 'INVOICE_CREATED_SYNC_FAILED' && result.invoice) {
        idempotencyKeyRef.current = null;
        setCreatedInvoiceId(result.invoice.btcpayInvoiceId);
        // The invoice exists in BTCPay and is payable, so it is still seeded and
        // shareable even though Hachisu's own record did not finish syncing.
        seedCreatedInvoice(activeStore.id, result.invoice);
        markStoreActivityStale(activeStore.id);
      }
      setSubmitError(result.message);
      setSubmitErrorCode(result.code);
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : 'Invoice could not be created right now. Try again.',
      );
      setSubmitErrorCode('NETWORK_ERROR');
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  /** Recovery action after a created-but-unsynced result: go look at the real
   * invoice rather than creating another one. */
  function viewCreatedInvoice() {
    if (!activeStore || !createdInvoiceId) return;
    router.replace({
      pathname: '/activity-details',
      params: {
        merchantStoreId: activeStore.id,
        invoiceId: createdInvoiceId,
        source: 'invoice',
      },
    });
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

          {submitError ? (
            <View style={styles.errorCard}>
              <MaterialIcons
                name={createdInvoiceId ? 'info-outline' : 'error-outline'}
                size={18}
                color={createdInvoiceId ? COLORS.secondaryText : '#F87171'}
              />
              <View style={styles.errorTextBlock}>
                <Text style={styles.errorText}>{submitError}</Text>
                {submitErrorCode === 'NO_PAYMENT_METHOD_AVAILABLE' ? (
                  <Text style={styles.errorHint}>
                    BTCPay decides which payment methods a store can offer. Connect
                    a Bitcoin wallet
                    {LIGHTNING_ENABLED ? ' (or set up Lightning)' : ''} in Account
                    settings, then try again.
                  </Text>
                ) : null}
                {createdInvoiceId ? (
                  <Pressable
                    onPress={viewCreatedInvoice}
                    style={({ pressed }) => [styles.recoveryButton, pressed && styles.pressed]}
                    accessibilityRole="button"
                    accessibilityLabel="View the created invoice">
                    <Text style={styles.recoveryLabel}>View the created invoice</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          ) : null}

          {!activeStore ? (
            <Text style={styles.inlineError}>
              Select a store before creating an invoice.
            </Text>
          ) : null}

          <View style={styles.createButton}>
            <PrimaryButton
              label={submitting ? 'Creating Invoice…' : 'Create Invoice'}
              onPress={handleCreate}
              disabled={!canSubmit}
            />
            {submitting ? (
              <View style={styles.submittingRow}>
                <ActivityIndicator size="small" color={COLORS.secondaryText} />
                <Text style={styles.submittingText}>
                  Creating your invoice in BTCPay…
                </Text>
              </View>
            ) : null}
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
  createButton: {
    marginTop: 32,
  },
  submittingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 12,
  },
  submittingText: {
    fontSize: 13,
    color: COLORS.secondaryText,
  },
  errorCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginTop: 24,
    padding: 14,
    borderRadius: 12,
    backgroundColor: COLORS.card,
  },
  errorTextBlock: {
    flex: 1,
  },
  errorText: {
    fontSize: 13,
    lineHeight: 19,
    color: COLORS.primaryText,
  },
  errorHint: {
    marginTop: 6,
    fontSize: 12,
    lineHeight: 17,
    color: COLORS.secondaryText,
  },
  recoveryButton: {
    marginTop: 10,
    alignSelf: 'flex-start',
  },
  recoveryLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: HachisuColors.cream,
  },
});
