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
import { isValidAmount } from '@/components/payments/invoices/create/validation';
import {
  ButtonTypeSelector,
  type PayButtonType,
} from '@/components/payments/pay-button/button-type-selector';
import { generatePayButtonOrderId } from '@/components/payments/pay-button/order-id';
import { PayButtonPreview } from '@/components/payments/pay-button/pay-button-preview';
import { COLORS } from '@/constants/colors';
import { HachisuColors } from '@/constants/hachisu-colors';
import { DEFAULT_CURRENCY } from '@/constants/currencies';
import { useActiveStore } from '@/contexts/active-store-context';

const DESTRUCTIVE_COLOR = '#F87171';

export default function PayButtonScreen() {
  const router = useRouter();
  const { activeStore } = useActiveStore();

  // Local-only state for MVP — nothing is persisted or sent to BTCPay.
  const [enabled, setEnabled] = useState(false);
  const [price, setPrice] = useState('');
  const [currency, setCurrency] = useState(
    activeStore?.default_currency ?? DEFAULT_CURRENCY,
  );
  const [checkoutDescription, setCheckoutDescription] = useState('');
  // Prefill once via a lazy initializer so it never overwrites edits on
  // re-render — only an explicit Regenerate tap replaces it.
  const [orderId, setOrderId] = useState(generatePayButtonOrderId);
  const [buttonType, setButtonType] = useState<PayButtonType>('fixed');
  const [sliderMin, setSliderMin] = useState('1');
  const [sliderMax, setSliderMax] = useState('20');
  const [sliderStep, setSliderStep] = useState('1');

  // Custom amount = merchant sets the amount (Price required). Fixed amount =
  // customer pays any amount (Price optional). Slider uses min/max/step.
  const priceRequired = buttonType === 'custom';
  const priceError =
    price.length > 0 && !isValidAmount(price)
      ? 'Enter a price greater than 0.'
      : null;

  // Slider sub-field validation (only meaningful when button type is slider).
  const minNum = Number(sliderMin);
  const maxNum = Number(sliderMax);
  const stepNum = Number(sliderStep);
  const sliderMinValid = Number.isFinite(minNum) && minNum > 0;
  const sliderMaxValid = Number.isFinite(maxNum) && maxNum > minNum;
  const sliderStepValid = Number.isFinite(stepNum) && stepNum > 0;
  const sliderMinError =
    sliderMin.length > 0 && !sliderMinValid ? 'Must be greater than 0.' : null;
  const sliderMaxError =
    sliderMax.length > 0 && !sliderMaxValid ? 'Must be greater than the minimum.' : null;
  const sliderStepError =
    sliderStep.length > 0 && !sliderStepValid ? 'Must be greater than 0.' : null;
  const sliderValid = sliderMinValid && sliderMaxValid && sliderStepValid;

  // Amount requirements differ per button type:
  //  - fixed:  price required and > 0
  //  - custom: price optional (valid only if entered)
  //  - slider: min/max/step required and valid (price ignored)
  const amountValid =
    buttonType === 'custom'
      ? isValidAmount(price)
      : buttonType === 'fixed'
        ? price.trim().length === 0 || isValidAmount(price)
        : sliderValid;

  const canSave = currency.length > 0 && amountValid && !priceError;

  function handleEnable() {
    setEnabled(true);
  }

  function handleDisable() {
    Alert.alert(
      'Disable Pay Button?',
      'Customers will no longer be able to use this store’s Pay Button once disabled.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Disable', style: 'destructive', onPress: () => setEnabled(false) },
      ],
    );
  }

  function regenerateOrderId() {
    setOrderId(generatePayButtonOrderId());
  }

  function handleSave() {
    if (!canSave) return;
    Alert.alert(
      'Pay Button',
      'Pay Button settings are local placeholders for now. Backend setup coming soon.',
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
            <View
              style={[
                styles.statusDot,
                { backgroundColor: enabled ? HachisuColors.primary : COLORS.cardBorder },
              ]}
            />
            <Text style={styles.statusText}>
              {enabled ? 'Pay Button enabled' : 'Pay Button disabled'}
            </Text>
          </View>

          {enabled ? (
            <Pressable
              onPress={handleDisable}
              style={({ pressed }) => [styles.disableButton, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel="Disable Pay Button">
              <Text style={styles.disableLabel}>Disable Pay Button</Text>
            </Pressable>
          ) : (
            <View style={styles.enableButton}>
              <PrimaryButton label="Enable Pay Button" onPress={handleEnable} />
            </View>
          )}

          {/* General settings (only when enabled) */}
          {enabled ? (
            <>
              <Text style={styles.sectionLabel}>GENERAL SETTINGS</Text>

              <InvoiceFormField
                label="Price"
                required={priceRequired}
                value={price}
                onChangeText={setPrice}
                placeholder="0.00"
                keyboardType="decimal-pad"
                returnKeyType="done"
                error={priceError}
                rightSlot={<Text style={styles.currencySuffix}>{currency}</Text>}
              />
              {buttonType === 'fixed' ? (
                <Text style={styles.helperText}>
                  Leave blank to let customers choose the amount.
                </Text>
              ) : buttonType === 'slider' ? (
                <Text style={styles.helperText}>
                  Not used for slider buttons — set the range below.
                </Text>
              ) : null}

              <View style={styles.fieldBlock}>
                <Text style={styles.fieldLabel}>
                  Currency <Text style={styles.required}>*</Text>
                </Text>
                <CurrencySelect value={currency} onChange={setCurrency} />
              </View>

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
                  Hachisu branding is used for Pay Button during MVP.
                </Text>
              </View>

              <View style={styles.fieldBlock}>
                <Text style={styles.fieldLabel}>Button type</Text>
                <ButtonTypeSelector value={buttonType} onChange={setButtonType} />
              </View>

              {buttonType === 'slider' ? (
                <View style={styles.sliderRow}>
                  <View style={styles.sliderItem}>
                    <InvoiceFormField
                      label="Minimum"
                      required
                      value={sliderMin}
                      onChangeText={setSliderMin}
                      placeholder="1"
                      keyboardType="decimal-pad"
                      error={sliderMinError}
                    />
                  </View>
                  <View style={styles.sliderItem}>
                    <InvoiceFormField
                      label="Maximum"
                      required
                      value={sliderMax}
                      onChangeText={setSliderMax}
                      placeholder="20"
                      keyboardType="decimal-pad"
                      error={sliderMaxError}
                    />
                  </View>
                  <View style={styles.sliderItem}>
                    <InvoiceFormField
                      label="Step"
                      required
                      value={sliderStep}
                      onChangeText={setSliderStep}
                      placeholder="1"
                      keyboardType="decimal-pad"
                      error={sliderStepError}
                    />
                  </View>
                </View>
              ) : null}

              {/* Preview */}
              <Text style={styles.sectionLabel}>PREVIEW</Text>
              <PayButtonPreview
                buttonType={buttonType}
                price={price}
                currency={currency}
                sliderMin={sliderMin}
                sliderMax={sliderMax}
              />
            </>
          ) : null}

          {/* Generated code (placeholder) */}
          <Text style={styles.sectionLabel}>GENERATED CODE</Text>
          <View style={styles.codeCard}>
            <Text style={styles.codeText}>
              {enabled
                ? 'Pay Button code will appear here after backend setup is connected.'
                : 'Enable Pay Button to configure settings and generate code.'}
            </Text>
          </View>

          {enabled ? (
            <>
              {/* Alternatives (placeholder) */}
              <Text style={styles.sectionLabel}>ALTERNATIVES</Text>
              <View style={styles.codeCard}>
                <Text style={styles.codeText}>
                  A shareable link, LNURL, and QR code will be available after Pay
                  Button generation is connected.
                </Text>
              </View>

              <View style={styles.saveButton}>
                <PrimaryButton
                  label="Save Pay Button Settings"
                  onPress={handleSave}
                  disabled={!canSave}
                />
              </View>
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
  sliderRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
  },
  sliderItem: {
    flex: 1,
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
  saveButton: {
    marginTop: 28,
  },
});
