import { StyleSheet, Text, View } from 'react-native';

import { isValidAmount } from '@/components/payments/invoices/create/validation';
import { COLORS } from '@/constants/colors';
import { HachisuColors } from '@/constants/hachisu-colors';
import type { PayButtonType } from '@/components/payments/pay-button/button-type-selector';

interface PayButtonPreviewProps {
  buttonType: PayButtonType;
  price: string;
  currency: string;
  sliderMin: string;
  sliderMax: string;
}

/**
 * Static, Hachisu-branded preview of the Pay Button. The amount area updates
 * locally based on the selected button type:
 *   - fixed:  open input mock — customer pays any amount
 *   - custom: stepper mock around the merchant-set amount
 *   - slider: range track mock
 * Everything here is decorative — nothing is pressable, no BTCPay branding, and
 * no external assets.
 */
export function PayButtonPreview({
  buttonType,
  price,
  currency,
  sliderMin,
  sliderMax,
}: PayButtonPreviewProps) {
  return (
    <View style={styles.card}>
      <AmountArea
        buttonType={buttonType}
        price={price}
        currency={currency}
        sliderMin={sliderMin}
        sliderMax={sliderMax}
      />
      {/* Decorative only — intentionally not pressable. */}
      <View
        style={styles.button}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants">
        <Text style={styles.buttonText}>Pay with Hachisu</Text>
      </View>
    </View>
  );
}

function AmountArea({
  buttonType,
  price,
  currency,
  sliderMin,
  sliderMax,
}: PayButtonPreviewProps) {
  if (buttonType === 'custom') {
    const value = isValidAmount(price) ? String(Number(price)) : '0';
    return (
      <View style={styles.amountArea}>
        <View style={styles.stepperRow}>
          <View style={styles.stepperButton}>
            <Text style={styles.stepperGlyph}>–</Text>
          </View>
          <View style={styles.valueBox}>
            <Text style={styles.valueText}>{value}</Text>
          </View>
          <View style={[styles.stepperButton, styles.stepperButtonAccent]}>
            <Text style={styles.stepperGlyph}>+</Text>
          </View>
        </View>
        <Text style={styles.currencyLabel}>{currency}</Text>
      </View>
    );
  }

  if (buttonType === 'slider') {
    const min = Number(sliderMin);
    const max = Number(sliderMax);
    const valid = Number.isFinite(min) && Number.isFinite(max) && max > min && min > 0;
    return (
      <View style={styles.amountArea}>
        <View style={styles.track}>
          <View style={styles.trackFill} />
          <View style={styles.knob} />
        </View>
        <Text style={styles.rangeText}>
          {valid ? `$${min} – $${max} ${currency}` : `Choose an amount range`}
        </Text>
      </View>
    );
  }

  // fixed — customer pays any amount
  return (
    <View style={styles.amountArea}>
      <View style={styles.inputMock}>
        <Text style={styles.inputPlaceholder}>Enter amount</Text>
        <Text style={styles.inputCurrency}>{currency}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: 'center',
    paddingVertical: 28,
    paddingHorizontal: 24,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  amountArea: {
    alignItems: 'center',
    marginBottom: 20,
  },
  // Custom amount stepper
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  stepperButton: {
    width: 52,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.cardAlt,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.cardBorder,
  },
  stepperButtonAccent: {
    borderColor: 'rgba(255, 247, 230, 0.5)',
  },
  stepperGlyph: {
    fontSize: 22,
    fontWeight: '600',
    color: COLORS.primaryText,
  },
  valueBox: {
    minWidth: 72,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    backgroundColor: COLORS.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.cardBorder,
  },
  valueText: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.primaryText,
  },
  currencyLabel: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.5,
    color: COLORS.secondaryText,
    marginTop: 8,
  },
  // Fixed (open) input mock
  inputMock: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minWidth: 200,
    height: 48,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: COLORS.cardAlt,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.cardBorder,
  },
  inputPlaceholder: {
    fontSize: 16,
    color: COLORS.mutedText,
  },
  inputCurrency: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.secondaryText,
  },
  // Slider mock
  track: {
    width: 200,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.cardBorder,
    justifyContent: 'center',
  },
  trackFill: {
    position: 'absolute',
    left: 0,
    width: 80,
    height: 6,
    borderRadius: 3,
    backgroundColor: HachisuColors.cream,
  },
  knob: {
    position: 'absolute',
    left: 72,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: HachisuColors.cream,
  },
  rangeText: {
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.secondaryText,
    marginTop: 16,
  },
  // Pay button
  button: {
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 999,
    backgroundColor: HachisuColors.cream,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '700',
    color: HachisuColors.black,
  },
});
