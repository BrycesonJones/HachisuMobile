import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CurrencySelect } from '@/components/account/currency-select';
import { PrimaryButton } from '@/components/auth/primary-button';
import { CollapsibleSection } from '@/components/payments/invoices/create/collapsible-section';
import { InvoiceFormField } from '@/components/payments/invoices/create/invoice-form-field';
import { isValidAmount } from '@/components/payments/invoices/create/validation';
import {
  ButtonTypeSelector,
  type PayButtonType,
} from '@/components/payments/pay-button/button-type-selector';
import { generatePayButtonOrderId } from '@/components/payments/pay-button/order-id';
import { PayButtonPreview } from '@/components/payments/pay-button/pay-button-preview';
import { COLORS } from '@/constants/colors';
import {
  LIGHTNING_BETA_COMING_SOON_LABEL,
  LIGHTNING_ENABLED,
} from '@/constants/feature-flags';
import { HachisuColors } from '@/constants/hachisu-colors';
import { DEFAULT_CURRENCY } from '@/constants/currencies';
import { useActiveStore } from '@/contexts/active-store-context';
import {
  generatePayButtonOutput,
  getPayButtonStatus,
  type PayButtonOutput,
  setPayButton,
} from '@/lib/btcpay/pay-button';
import { WalletRequiredCard } from '@/components/payments/wallet-required-card';
import { isOnchainReadyForPayments } from '@/lib/payments/wallet-gate';

const DESTRUCTIVE_COLOR = '#F87171';

export default function PayButtonScreen() {
  const router = useRouter();
  const { activeStore } = useActiveStore();
  const merchantStoreId = activeStore?.id ?? null;

  // Cached, UX-only wallet readiness. Enabling the Pay Button (and generating its
  // output) exposes a public checkout surface, so both require a connected
  // on-chain wallet. The server enforces this authoritatively; this only decides
  // whether to offer Enable or a connect CTA. Disabling never requires a wallet.
  const walletReady = isOnchainReadyForPayments(activeStore);

  // Pay Button enabled state is AUTHORITATIVE: it is read from BTCPay via the
  // edge function, never an optimistic local flip. `statusLoading` covers the
  // initial fetch; `busy` covers an in-flight enable/disable.
  const [enabled, setEnabled] = useState(false);
  const [statusLoading, setStatusLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  // Amount configuration. Which of these apply depends on the button type:
  //   fixed  -> price
  //   custom -> min / max / step
  //   slider -> min / max / step
  // Defaults match BTCPay's Pay Button admin page (price 1; range 1–20, step 1).
  const [price, setPrice] = useState('1');
  const [min, setMin] = useState('1');
  const [max, setMax] = useState('20');
  const [step, setStep] = useState('1');
  const [currency, setCurrency] = useState(
    activeStore?.default_currency ?? DEFAULT_CURRENCY,
  );
  const [checkoutDescription, setCheckoutDescription] = useState('');
  // Prefill once via a lazy initializer so it never overwrites edits on
  // re-render — only an explicit Regenerate tap replaces it.
  const [orderId, setOrderId] = useState(generatePayButtonOrderId);
  const [buttonType, setButtonType] = useState<PayButtonType>('custom');

  // Generated output state. The output is produced by the backend from
  // BTCPay-confirmed data; the client only renders/copies/shares it.
  const [output, setOutput] = useState<PayButtonOutput | null>(null);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [altTab, setAltTab] = useState<'link' | 'lnurl'>('link');
  const [copied, setCopied] = useState<'code' | 'link' | 'lnurl' | null>(null);

  // Amount validation is per button type:
  //   fixed  -> a positive Price is required
  //   custom -> Min/Max/Step required; Min>0, Max>Min, Step>0
  //   slider -> same as custom
  const usesRange = buttonType === 'custom' || buttonType === 'slider';
  const minNum = Number(min);
  const maxNum = Number(max);
  const stepNum = Number(step);

  const priceError =
    buttonType === 'fixed'
      ? price.trim() === ''
        ? 'Price is required for fixed amount.'
        : !isValidAmount(price)
          ? 'Price must be greater than 0.'
          : null
      : null;

  const minError = !usesRange
    ? null
    : min.trim() === ''
      ? 'Min is required.'
      : !(Number.isFinite(minNum) && minNum > 0)
        ? 'Min must be greater than 0.'
        : null;
  const maxError = !usesRange
    ? null
    : max.trim() === ''
      ? 'Max is required.'
      : !(Number.isFinite(maxNum) && Number.isFinite(minNum) && maxNum > minNum)
        ? 'Max must be greater than Min.'
        : null;
  const stepError = !usesRange
    ? null
    : step.trim() === ''
      ? 'Step is required.'
      : !(Number.isFinite(stepNum) && stepNum > 0)
        ? 'Step must be greater than 0.'
        : null;

  const amountValid =
    buttonType === 'fixed' ? !priceError : !minError && !maxError && !stepError;
  const canGenerate = enabled && !generating && currency.length > 0 && amountValid;

  // While the Lightning product gate is off, LNURL is never offered — even for a
  // store whose backend already has Lightning connected. The tab stays visible
  // but muted and inert.
  const lnurlAvailable = LIGHTNING_ENABLED && !!output?.lightningAvailable && !!output?.lnurl;

  // Fetch the authoritative Pay Button status from the backend. `showLoading`
  // toggles the big status spinner (used on first load / store switch); after an
  // enable/disable we reconcile silently so the button doesn't flash a spinner.
  const fetchStatus = useCallback(
    async (showLoading = true) => {
      if (!merchantStoreId) {
        setEnabled(false);
        setStatusError(null);
        setStatusLoading(false);
        return;
      }
      if (showLoading) setStatusLoading(true);
      const res = await getPayButtonStatus(merchantStoreId);
      if (res.ok) {
        setEnabled(res.enabled);
        setStatusError(null);
      } else {
        setStatusError(res.error);
      }
      setStatusLoading(false);
    },
    [merchantStoreId],
  );

  // Load status on mount and whenever the active store changes. Reset first so
  // no Pay Button state (status OR generated output) leaks across stores.
  useEffect(() => {
    setEnabled(false);
    setStatusError(null);
    setOutput(null);
    setGenError(null);
    setAltTab('link');
    fetchStatus(true);
  }, [fetchStatus]);

  // Any config edit invalidates a previously generated output, so it can never
  // be shown/copied when it no longer matches the on-screen settings.
  useEffect(() => {
    setOutput(null);
    setGenError(null);
  }, [price, min, max, step, currency, checkoutDescription, orderId, buttonType]);

  async function handleEnable() {
    if (!merchantStoreId || busy) return;
    setBusy(true);
    setStatusError(null);
    const res = await setPayButton(merchantStoreId, true);
    if (!res.ok) {
      // Keep the disabled UI — never fake enabled state on failure.
      setStatusError(res.error);
      setBusy(false);
      return;
    }
    // Re-fetch authoritative status after BTCPay confirmed the change.
    await fetchStatus(false);
    setBusy(false);
  }

  function handleDisable() {
    if (!merchantStoreId || busy) return;
    Alert.alert(
      'Disable Pay Button?',
      'Customers will no longer be able to use this store’s Pay Button once disabled.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disable',
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            setStatusError(null);
            const res = await setPayButton(merchantStoreId, false);
            if (!res.ok) {
              setStatusError(res.error);
              setBusy(false);
              return;
            }
            await fetchStatus(false);
            setBusy(false);
          },
        },
      ],
    );
  }

  function regenerateOrderId() {
    // A fresh order id before generation — never reuse one hardcoded id forever.
    setOrderId(generatePayButtonOrderId());
  }

  async function handleGenerate() {
    if (!merchantStoreId || !canGenerate) return;
    setGenerating(true);
    setGenError(null);
    const res = await generatePayButtonOutput({
      merchantStoreId,
      buttonType,
      // Fixed uses price; custom/slider use min/max/step. The backend reads only
      // the fields relevant to the chosen type.
      price: buttonType === 'fixed' ? price.trim() : null,
      min: usesRange ? min.trim() : null,
      max: usesRange ? max.trim() : null,
      step: usesRange ? step.trim() : null,
      currency,
      checkoutDescription: checkoutDescription.trim() || null,
      orderId: orderId.trim() || null,
      outputType: 'link',
    });
    if (!res.ok) {
      setGenError(res.error);
      setOutput(null);
      setGenerating(false);
      return;
    }
    setOutput(res);
    setAltTab('link');
    setGenerating(false);
  }

  async function handleCopy(key: 'code' | 'link' | 'lnurl', value: string) {
    if (!value) return;
    await Clipboard.setStringAsync(value);
    setCopied(key);
    setTimeout(() => setCopied((k) => (k === key ? null : k)), 1500);
  }

  async function handleShare(value: string) {
    if (!value) return;
    try {
      await Share.share({ message: value });
    } catch {
      // User dismissed the share sheet — nothing to do.
    }
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
          <Text style={styles.title}>Pay Button</Text>
          {activeStore ? (
            <View style={styles.storeRow}>
              <MaterialIcons name="storefront" size={15} color={COLORS.secondaryText} />
              <Text style={styles.storeName} numberOfLines={1}>
                {activeStore.name}
              </Text>
            </View>
          ) : null}

          {/* Intro */}
          <View style={styles.introCard}>
            <View style={styles.iconBadge}>
              <MaterialIcons
                name="volunteer-activism"
                size={24}
                color={HachisuColors.cream}
              />
            </View>
            <Text style={styles.introTitle}>Tips &amp; Simple Payments</Text>
            <Text style={styles.introBody}>
              Create a simple Bitcoin payment button for tips, donations, support
              payments, or lightweight pay-me links.
            </Text>
          </View>

          {/* Guidance */}
          <View style={styles.guidanceCard}>
            <View style={styles.guidanceHeader}>
              <MaterialIcons name="info-outline" size={18} color={HachisuColors.primary} />
              <Text style={styles.guidanceTitle}>
                Best for tips and simple payment links
              </Text>
            </View>
            <Text style={styles.guidanceBody}>
              Pay Button is best for tips, donations, and simple payment links. For
              ecommerce checkouts or product orders, use Invoices or Point of Sale
              instead.
            </Text>
          </View>

          {/* Learn more */}
          <View style={styles.learnMoreBlock}>
            <CollapsibleSection title="Learn more">
              <Text style={styles.learnMoreBody}>
                Pay Button settings can be embedded outside the app, so it should
                not be used for secure cart or inventory-based checkout.
              </Text>
            </CollapsibleSection>
          </View>

          {/* Status + enable/disable */}
          <View style={styles.statusRow}>
            {statusLoading ? (
              <ActivityIndicator size="small" color={COLORS.secondaryText} />
            ) : (
              <View
                style={[
                  styles.statusDot,
                  { backgroundColor: enabled ? HachisuColors.primary : COLORS.cardBorder },
                ]}
              />
            )}
            <Text style={styles.statusText}>
              {statusLoading
                ? 'Checking Pay Button status…'
                : enabled
                  ? 'Pay Button enabled'
                  : 'Pay Button disabled'}
            </Text>
          </View>

          {statusError ? (
            <View style={styles.errorCard}>
              <MaterialIcons name="error-outline" size={18} color={DESTRUCTIVE_COLOR} />
              <Text style={styles.errorText}>{statusError}</Text>
            </View>
          ) : null}

          {statusLoading ? null : enabled ? (
            <Pressable
              onPress={handleDisable}
              disabled={busy}
              style={({ pressed }) => [
                styles.disableButton,
                (pressed || busy) && styles.pressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Disable Pay Button">
              <Text style={styles.disableLabel}>
                {busy ? 'Disabling…' : 'Disable Pay Button'}
              </Text>
            </Pressable>
          ) : !walletReady ? (
            <WalletRequiredCard feature="pay-button" />
          ) : (
            <View style={styles.enableButton}>
              <PrimaryButton
                label={busy ? 'Enabling…' : 'Enable Pay Button'}
                onPress={handleEnable}
                disabled={busy || !merchantStoreId}
              />
            </View>
          )}

          {/* General settings (only when enabled) */}
          {enabled ? (
            <>
              <Text style={styles.sectionLabel}>GENERAL SETTINGS</Text>

              {/* Currency first — it labels the amount fields below. */}
              <View style={styles.fieldBlock}>
                <Text style={styles.fieldLabel}>
                  Currency <Text style={styles.required}>*</Text>
                </Text>
                <CurrencySelect value={currency} onChange={setCurrency} />
              </View>

              {/* Button Type next — it determines how the amount is configured. */}
              <View style={styles.fieldBlock}>
                <Text style={styles.fieldLabel}>Button type</Text>
                <ButtonTypeSelector value={buttonType} onChange={setButtonType} />
              </View>

              {/* Amount fields depend on the button type: Price for Fixed, or
                  Min/Max/Step for Custom and Slider. */}
              {buttonType === 'fixed' ? (
                <View style={styles.fieldBlock}>
                  <InvoiceFormField
                    label="Price"
                    required
                    value={price}
                    onChangeText={setPrice}
                    placeholder="0.00"
                    keyboardType="decimal-pad"
                    returnKeyType="done"
                    error={priceError}
                    rightSlot={<Text style={styles.currencySuffix}>{currency}</Text>}
                  />
                  <Text style={styles.helperText}>
                    This is the amount customers will pay.
                  </Text>
                </View>
              ) : (
                <View style={styles.fieldBlock}>
                  <View style={styles.rangeRow}>
                    <View style={styles.rangeItem}>
                      <InvoiceFormField
                        label="Min"
                        required
                        value={min}
                        onChangeText={setMin}
                        placeholder="1"
                        keyboardType="decimal-pad"
                        error={minError}
                      />
                    </View>
                    <View style={styles.rangeItem}>
                      <InvoiceFormField
                        label="Max"
                        required
                        value={max}
                        onChangeText={setMax}
                        placeholder="20"
                        keyboardType="decimal-pad"
                        error={maxError}
                      />
                    </View>
                    <View style={styles.rangeItem}>
                      <InvoiceFormField
                        label="Step"
                        required
                        value={step}
                        onChangeText={setStep}
                        placeholder="1"
                        keyboardType="decimal-pad"
                        error={stepError}
                      />
                    </View>
                  </View>
                  <Text style={styles.helperText}>
                    {buttonType === 'slider'
                      ? 'Customers can choose an amount with a slider.'
                      : 'Customers can choose an amount within this range.'}
                  </Text>
                </View>
              )}

              <View style={styles.fieldBlock}>
                <Text style={styles.fieldLabel}>Default Payment Method</Text>
                <View style={styles.readonlyField}>
                  <Text style={styles.readonlyValue}>Use the store’s default</Text>
                  <MaterialIcons name="lock-outline" size={18} color={COLORS.mutedText} />
                </View>
                <Text style={styles.helperText}>
                  Payment method preferences can be managed in store settings later.
                </Text>
              </View>

              <InvoiceFormField
                label="Checkout Description"
                value={checkoutDescription}
                onChangeText={setCheckoutDescription}
                placeholder="Example: Support Hachisu"
              />

              <InvoiceFormField
                label="Order ID"
                value={orderId}
                onChangeText={setOrderId}
                placeholder="Auto-generated"
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

              {/* Display options */}
              <Text style={styles.sectionLabel}>DISPLAY OPTIONS</Text>

              <View style={styles.fieldBlock}>
                <Text style={styles.fieldLabel}>Button text</Text>
                <View style={styles.readonlyField}>
                  <Text style={styles.readonlyValue}>Pay with Hachisu</Text>
                  <MaterialIcons name="lock-outline" size={18} color={COLORS.mutedText} />
                </View>
                <Text style={styles.helperText}>
                  Button text is set automatically for this version.
                </Text>
              </View>

              {/* Preview */}
              <Text style={styles.sectionLabel}>PREVIEW</Text>
              <PayButtonPreview
                buttonType={buttonType}
                price={price}
                currency={currency}
                min={min}
                max={max}
                step={step}
              />
            </>
          ) : null}

          {/* Generate + generated output (only when enabled) */}
          {enabled ? (
            <>
              <View style={styles.generateButton}>
                <PrimaryButton
                  label={
                    generating
                      ? 'Generating…'
                      : output
                        ? 'Regenerate Pay Button'
                        : 'Generate Pay Button'
                  }
                  onPress={handleGenerate}
                  disabled={!canGenerate}
                />
              </View>
              {buttonType === 'fixed' && !isValidAmount(price) ? (
                <Text style={styles.helperText}>
                  Enter a price to generate a fixed-amount button.
                </Text>
              ) : null}

              {genError ? (
                <View style={styles.errorCard}>
                  <MaterialIcons name="error-outline" size={18} color={DESTRUCTIVE_COLOR} />
                  <Text style={styles.errorText}>{genError}</Text>
                </View>
              ) : null}

              {output ? (
                <>
                  {/* Generated code */}
                  <Text style={styles.sectionLabel}>GENERATED CODE</Text>
                  <View style={styles.codeCard}>
                    <Text style={styles.codeMono} selectable>
                      {output.htmlCode}
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => handleCopy('code', output.htmlCode)}
                    style={({ pressed }) => [styles.copyBtn, pressed && styles.pressed]}
                    accessibilityRole="button"
                    accessibilityLabel="Copy Pay Button code">
                    <MaterialIcons
                      name={copied === 'code' ? 'check' : 'content-copy'}
                      size={16}
                      color={HachisuColors.black}
                    />
                    <Text style={styles.copyBtnText}>
                      {copied === 'code' ? 'Copied' : 'Copy Code'}
                    </Text>
                  </Pressable>

                  {/* Alternatives: Link / LNURL */}
                  <Text style={styles.sectionLabel}>ALTERNATIVES</Text>
                  {output.limitations.length > 0 ? (
                    <View style={styles.noteCard}>
                      <MaterialIcons
                        name="info-outline"
                        size={16}
                        color={COLORS.secondaryText}
                      />
                      <Text style={styles.noteText}>{output.limitations.join(' ')}</Text>
                    </View>
                  ) : null}
                  <View style={styles.tabRow}>
                    <Pressable
                      onPress={() => setAltTab('link')}
                      style={[styles.tab, altTab === 'link' && styles.tabActive]}
                      accessibilityRole="tab"
                      accessibilityState={{ selected: altTab === 'link' }}>
                      <Text style={[styles.tabText, altTab === 'link' && styles.tabTextActive]}>
                        Link
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={lnurlAvailable ? () => setAltTab('lnurl') : undefined}
                      disabled={!lnurlAvailable}
                      style={[
                        styles.tab,
                        altTab === 'lnurl' && styles.tabActive,
                        !lnurlAvailable && styles.tabDisabled,
                      ]}
                      accessibilityRole="tab"
                      accessibilityState={{ selected: altTab === 'lnurl', disabled: !lnurlAvailable }}>
                      <Text style={[styles.tabText, altTab === 'lnurl' && styles.tabTextActive]}>
                        {LIGHTNING_ENABLED ? 'LNURL' : 'LNURL · Beta'}
                      </Text>
                    </Pressable>
                  </View>

                  {altTab === 'lnurl' && !lnurlAvailable ? (
                    <View style={styles.altCard}>
                      <Text style={styles.codeText}>
                        {LIGHTNING_ENABLED
                          ? 'Connect Lightning to use LNURL.'
                          : LIGHTNING_BETA_COMING_SOON_LABEL}
                      </Text>
                    </View>
                  ) : (
                    (() => {
                      const value = altTab === 'lnurl' ? (output.lnurl ?? '') : output.linkUrl;
                      const copyKey = altTab === 'lnurl' ? 'lnurl' : 'link';
                      const copyLabel = altTab === 'lnurl' ? 'Copy LNURL' : 'Copy Link';
                      return (
                        <View style={styles.altCard}>
                          {value ? (
                            <View style={styles.qrWrap}>
                              <QRCode
                                value={value}
                                size={196}
                                backgroundColor="#f5f5f7"
                                color="#000"
                              />
                            </View>
                          ) : null}
                          <Text style={styles.altUrl} selectable>
                            {value}
                          </Text>
                          <View style={styles.altActions}>
                            <Pressable
                              onPress={() => handleCopy(copyKey, value)}
                              style={({ pressed }) => [
                                styles.actionBtn,
                                pressed && styles.pressed,
                              ]}
                              accessibilityRole="button"
                              accessibilityLabel={copyLabel}>
                              <MaterialIcons
                                name={copied === copyKey ? 'check' : 'content-copy'}
                                size={16}
                                color={COLORS.primaryText}
                              />
                              <Text style={styles.actionBtnText}>
                                {copied === copyKey ? 'Copied' : copyLabel}
                              </Text>
                            </Pressable>
                            <Pressable
                              onPress={() => handleShare(value)}
                              style={({ pressed }) => [
                                styles.actionBtn,
                                pressed && styles.pressed,
                              ]}
                              accessibilityRole="button"
                              accessibilityLabel="Share">
                              <MaterialIcons
                                name="ios-share"
                                size={16}
                                color={COLORS.primaryText}
                              />
                              <Text style={styles.actionBtnText}>Share</Text>
                            </Pressable>
                          </View>
                        </View>
                      );
                    })()
                  )}

                  <Text style={styles.generatedMeta}>
                    Generated from BTCPay · {output.currency}
                    {output.price ? ` · ${output.price}` : ' · customer chooses'}
                  </Text>
                </>
              ) : null}
            </>
          ) : null}
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
  introCard: {
    marginTop: 28,
    padding: 20,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  iconBadge: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    marginBottom: 16,
  },
  introTitle: {
    fontSize: 19,
    fontWeight: '700',
    color: COLORS.primaryText,
    marginBottom: 8,
  },
  introBody: {
    fontSize: 15,
    lineHeight: 22,
    color: COLORS.secondaryText,
  },
  guidanceCard: {
    marginTop: 16,
    padding: 16,
    borderRadius: 16,
    backgroundColor: COLORS.cardAlt,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.cardBorder,
  },
  guidanceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  guidanceTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.primaryText,
  },
  guidanceBody: {
    fontSize: 14,
    lineHeight: 21,
    color: COLORS.secondaryText,
  },
  learnMoreBlock: {
    marginTop: 16,
  },
  learnMoreBody: {
    fontSize: 14,
    lineHeight: 21,
    color: COLORS.secondaryText,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 28,
  },
  statusDot: {
    width: 9,
    height: 9,
    borderRadius: 999,
  },
  statusText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.primaryText,
  },
  enableButton: {
    marginTop: 16,
  },
  errorCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 14,
    padding: 14,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(248, 113, 113, 0.5)',
    backgroundColor: 'rgba(248, 113, 113, 0.08)',
  },
  errorText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    color: DESTRUCTIVE_COLOR,
  },
  disableButton: {
    marginTop: 16,
    height: 52,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(248, 113, 113, 0.5)',
    backgroundColor: 'rgba(248, 113, 113, 0.08)',
  },
  disableLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: DESTRUCTIVE_COLOR,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 1,
    color: COLORS.secondaryText,
    marginTop: 32,
    marginBottom: 4,
  },
  fieldBlock: {
    marginTop: 18,
  },
  rangeRow: {
    flexDirection: 'row',
    gap: 12,
  },
  rangeItem: {
    flex: 1,
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
  readonlyField: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 52,
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
  codeCard: {
    marginTop: 8,
    padding: 18,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.cardBorder,
    backgroundColor: COLORS.cardAlt,
  },
  codeText: {
    fontSize: 14,
    lineHeight: 21,
    color: COLORS.mutedText,
  },
  codeMono: {
    fontSize: 12,
    lineHeight: 18,
    color: COLORS.primaryText,
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
  },
  generateButton: {
    marginTop: 32,
  },
  copyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 12,
    height: 48,
    borderRadius: 999,
    backgroundColor: COLORS.cream,
  },
  copyBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: HachisuColors.black,
  },
  noteCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 8,
    padding: 12,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.cardBorder,
    backgroundColor: COLORS.cardAlt,
  },
  noteText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
    color: COLORS.secondaryText,
  },
  tabRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
    marginBottom: 12,
  },
  tab: {
    flex: 1,
    height: 40,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.cardBorder,
    backgroundColor: COLORS.cardAlt,
  },
  tabActive: {
    borderColor: 'rgba(255, 247, 230, 0.5)',
    backgroundColor: 'rgba(255, 247, 230, 0.08)',
  },
  tabDisabled: {
    opacity: 0.4,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.secondaryText,
  },
  tabTextActive: {
    color: COLORS.primaryText,
  },
  altCard: {
    alignItems: 'center',
    padding: 18,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.cardBorder,
    backgroundColor: COLORS.cardAlt,
  },
  qrWrap: {
    padding: 12,
    borderRadius: 14,
    backgroundColor: '#f5f5f7',
    marginBottom: 14,
  },
  altUrl: {
    fontSize: 13,
    lineHeight: 19,
    color: COLORS.secondaryText,
    textAlign: 'center',
  },
  altActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.cardBorder,
    backgroundColor: COLORS.card,
  },
  actionBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.primaryText,
  },
  generatedMeta: {
    fontSize: 12,
    color: COLORS.mutedText,
    textAlign: 'center',
    marginTop: 16,
  },
});
