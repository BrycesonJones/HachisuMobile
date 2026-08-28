import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
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
import { LIGHTNING_ENABLED } from '@/constants/feature-flags';
import { HachisuColors } from '@/constants/hachisu-colors';
import { DEFAULT_CURRENCY } from '@/constants/currencies';
import { useActiveStore } from '@/contexts/active-store-context';
import { upsertPaymentRequest } from '@/lib/btcpay/payment-request-cache';
import {
  createPaymentRequest,
  newPaymentRequestIdempotencyKey,
  type CustomerDataOption,
  type PaymentRequestErrorCode,
} from '@/lib/btcpay/payment-requests';

const EXPIRATION_OPTIONS: readonly SelectOption[] = [
  { id: 'none', label: 'No expiration' },
  { id: '24h', label: '24 hours' },
  { id: '7d', label: '7 days' },
  { id: '30d', label: '30 days' },
];

/** Whole hours per UI option; null = the request never expires. The backend
 * validates hours and computes BTCPay's expiryDate from them. */
const EXPIRATION_HOURS: Record<string, number | null> = {
  none: null,
  '24h': 24,
  '7d': 7 * 24,
  '30d': 30 * 24,
};

const CUSTOMER_DATA_BY_ID: Record<string, CustomerDataOption> = {
  none: 'none',
  email: 'email',
  shipping: 'shipping',
};

const CUSTOMER_DATA_OPTIONS: readonly SelectOption[] = [
  { id: 'none', label: 'Do not request any information' },
  { id: 'email', label: 'Request email address only' },
  { id: 'shipping', label: 'Request shipping address' },
];

export default function CreatePaymentRequestScreen() {
  const router = useRouter();

  // Deep links and restarts can land here with no back history — fall back to
  // the requests list deterministically rather than trusting router.back().
  const returnToRequests = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/payments/requests');
  }, [router]);
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

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitErrorCode, setSubmitErrorCode] = useState<PaymentRequestErrorCode | null>(null);
  /** Set once BTCPay holds a real payment request for this form, INCLUDING the
   * created-but-unsynced case — it is what stops a second create. */
  const [createdRequestId, setCreatedRequestId] = useState<string | null>(null);

  // Refs, not state: these must be correct within a single tap, before re-render.
  const submittingRef = useRef(false);
  const idempotencyKeyRef = useRef<string | null>(null);

  // BTCPay requires a positive amount on EVERY payment request (verified against
  // the deployed server) — "allow custom amounts" governs how customers may pay
  // against it (their own or partial amounts), not whether an amount exists.
  const amountError =
    amount.length > 0 && !isValidAmount(amount)
      ? 'Enter an amount greater than 0.'
      : null;
  const recipientEmailError =
    recipientEmail.length > 0 && !isValidEmail(recipientEmail)
      ? 'Enter a valid email address.'
      : null;

  const formValid =
    title.trim().length > 0 &&
    currency.length > 0 &&
    isValidAmount(amount) &&
    !recipientEmailError;

  const canSubmit = formValid && !!activeStore && !submitting && !createdRequestId;

  function regenerateReferenceId() {
    setReferenceId(generatePaymentRequestReferenceId());
  }

  /**
   * Creates the payment request for real: one Edge Function call that
   * authenticates the merchant, resolves this store's BTCPay id server-side,
   * creates the request in BTCPay, records it, and returns the normalized model
   * including the authoritative public payment page URL.
   *
   * Duplicate protection is layered exactly like Create Invoice: disabled
   * button + a ref that beats the re-render, with the AUTHORITATIVE guarantee
   * being the server's unique (store, idempotency key) row — a retry of this
   * same attempt returns the SAME request instead of creating a second one.
   */
  async function handleCreate() {
    if (!canSubmit || !activeStore) return;
    if (submittingRef.current) return; // Beats the re-render on a fast double tap.
    submittingRef.current = true;

    // One key per submission ATTEMPT, reused across retries of that attempt.
    if (!idempotencyKeyRef.current) {
      idempotencyKeyRef.current = newPaymentRequestIdempotencyKey();
    }

    setSubmitting(true);
    setSubmitError(null);
    setSubmitErrorCode(null);

    try {
      const result = await createPaymentRequest({
        merchantStoreId: activeStore.id,
        idempotencyKey: idempotencyKeyRef.current,
        title: title.trim(),
        amount: amount.trim(),
        currency,
        allowCustomAmounts: allowCustomAmount,
        memo,
        referenceId,
        recipientEmail,
        expiresInHours: EXPIRATION_HOURS[expirationId] ?? null,
        customerDataOption: CUSTOMER_DATA_BY_ID[customerDataId] ?? 'none',
      });

      if (result.ok) {
        // The request exists in BTCPay. Retire this attempt's key so a later
        // request from this screen can never collide with it.
        idempotencyKeyRef.current = null;
        setCreatedRequestId(result.paymentRequest.btcpayPaymentRequestId);

        // Seed the detail cache from the authoritative create response so the
        // detail screen paints — and can share the request URL — without a
        // second round-trip. The screen still fetches the authoritative record.
        upsertPaymentRequest(activeStore.id, result.paymentRequest);

        router.replace({
          pathname: '/payments/requests/detail',
          params: {
            merchantStoreId: activeStore.id,
            paymentRequestId: result.paymentRequest.btcpayPaymentRequestId,
          },
        });
        return;
      }

      // Created in BTCPay but not synced locally: the request is REAL. Keep the
      // form intact, surface a recovery path, and never invite a second create.
      if (result.code === 'PAYMENT_REQUEST_CREATED_SYNC_FAILED' && result.paymentRequest) {
        idempotencyKeyRef.current = null;
        setCreatedRequestId(result.paymentRequest.btcpayPaymentRequestId);
        upsertPaymentRequest(activeStore.id, result.paymentRequest);
      }
      setSubmitError(result.message);
      setSubmitErrorCode(result.code);
    } catch (err) {
      setSubmitError(
        err instanceof Error
          ? err.message
          : 'Payment request could not be created right now. Try again.',
      );
      setSubmitErrorCode('NETWORK_ERROR');
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  /** Recovery action after a created-but-unsynced result: go look at the real
   * request rather than creating another one. */
  function viewCreatedRequest() {
    if (!activeStore || !createdRequestId) return;
    router.replace({
      pathname: '/payments/requests/detail',
      params: {
        merchantStoreId: activeStore.id,
        paymentRequestId: createdRequestId,
      },
    });
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="light-content" />

      <View style={styles.headerRow}>
        <Pressable
          onPress={returnToRequests}
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

          <View style={styles.toggleBlock}>
            <ToggleRow
              label="Allow customer to choose amount"
              description="Customers can pay their own or partial amounts toward the requested amount. Useful for donations, tips, or flexible service payments."
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
            Optional. Saved with the request and attached to payments made
            through it. Hachisu does not send the request by email — share the
            payment link after creating it.
          </Text>

          {submitError ? (
            <View style={styles.errorCard}>
              <MaterialIcons
                name={createdRequestId ? 'info-outline' : 'error-outline'}
                size={18}
                color={createdRequestId ? COLORS.secondaryText : '#F87171'}
              />
              <View style={styles.errorTextBlock}>
                <Text style={styles.errorText}>{submitError}</Text>
                {submitErrorCode === 'NO_PAYMENT_METHOD_AVAILABLE' ? (
                  <Text style={styles.errorHint}>
                    BTCPay decides which payment methods a store can offer.
                    Connect a Bitcoin wallet
                    {LIGHTNING_ENABLED ? ' (or set up Lightning)' : ''} in Account
                    settings, then try again.
                  </Text>
                ) : null}
                {createdRequestId ? (
                  <Pressable
                    onPress={viewCreatedRequest}
                    style={({ pressed }) => [styles.recoveryButton, pressed && styles.pressed]}
                    accessibilityRole="button"
                    accessibilityLabel="View the created payment request">
                    <Text style={styles.recoveryLabel}>View the created request</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          ) : null}

          {!activeStore ? (
            <Text style={styles.inlineError}>
              Select a store before creating a payment request.
            </Text>
          ) : null}

          <View style={styles.createButton}>
            <PrimaryButton
              label={submitting ? 'Creating Request…' : 'Create Request'}
              onPress={handleCreate}
              disabled={!canSubmit}
            />
            {submitting ? (
              <View style={styles.submittingRow}>
                <ActivityIndicator size="small" color={COLORS.secondaryText} />
                <Text style={styles.submittingText}>
                  Creating your payment request in BTCPay…
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
  inlineError: {
    marginTop: 10,
    fontSize: 13,
    color: '#F87171',
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
