import { StyleSheet, Text, View } from 'react-native';

import { isValidAmount } from '@/components/payments/invoices/create/validation';
import { COLORS } from '@/constants/colors';
import { HachisuColors } from '@/constants/hachisu-colors';
import type { PayButtonType } from '@/components/payments/pay-button/button-type-selector';

interface PayButtonPreviewProps {
  buttonType: PayButtonType;
  price: string;
  currency: string;
  min: string;
  max: string;
  step: string;
}

const TRACK_WIDTH = 200;
const KNOB_SIZE = 18;

/**
 * Static, Hachisu-branded preview of the Pay Button. Purely visual — it never
 * creates an invoice or calls the backend. The amount area mirrors what the payer
 * sees for the selected button type:
 *   - fixed:  the amount the merchant set (or "Enter a price" when blank)
 *   - custom: a stepper mock (− value +) the payer adjusts, within Min/Max/Step
 *   - slider: a value + slider track/thumb, within Min/Max/Step
 * Invalid/blank inputs degrade to a safe placeholder instead of crashing.
 */
export function PayButtonPreview(props: PayButtonPreviewProps) {
  return (
    <View style={styles.card}>
      <AmountArea {...props} />
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

interface Range {
  minN: number;
  maxN: number;
  stepN: number;
  valid: boolean;
}

/** Parses min/max/step and reports whether they form a usable range. */
function parseRange(min: string, max: string, step: string): Range {
  const minN = Number(min);
  const maxN = Number(max);
  const stepN = Number(step);
  const valid =
    Number.isFinite(minN) &&
    minN > 0 &&
    Number.isFinite(maxN) &&
    maxN > minN &&
    Number.isFinite(stepN) &&
    stepN > 0;
  return { minN, maxN, stepN, valid };
}

/** Snaps a value onto the min + k*step grid, clamped to [min, max]. */
function snapToStep(value: number, { minN, maxN, stepN }: Range): number {
  const steps = Math.round((value - minN) / stepN);
  const v = Math.min(maxN, Math.max(minN, minN + steps * stepN));
  return Number(v.toFixed(6));
}

/** Trims float noise for display (e.g. 10.50 -> "10.5", 20 -> "20"). */
function formatAmount(n: number): string {
  return String(Number(n.toFixed(2)));
}

function AmountArea({ buttonType, price, currency, min, max, step }: PayButtonPreviewProps) {
  // Fixed — customer pays exactly the amount the merchant set.
  if (buttonType === 'fixed') {
    const valid = isValidAmount(price);
    return (
      <View style={styles.amountArea}>
        <View style={styles.valueBox}>
          <Text style={valid ? styles.valueText : styles.placeholderText}>
            {valid ? price.trim() : 'Enter a price'}
          </Text>
        </View>
        {valid ? <Text style={styles.currencyLabel}>{currency}</Text> : null}
      </View>
    );
  }

  const range = parseRange(min, max, step);
  const helper = range.valid
    ? `Min ${formatAmount(range.minN)} · Max ${formatAmount(range.maxN)} · Step ${formatAmount(range.stepN)}`
    : 'Enter a valid range.';

  // Custom — payer adjusts the amount with steppers; preview starts at Min.
  if (buttonType === 'custom') {
    return (
      <View style={styles.amountArea}>
        <View style={styles.stepperRow}>
          <View style={styles.stepperButton}>
            <Text style={styles.stepperGlyph}>–</Text>
          </View>
          <View style={styles.valueBox}>
            <Text style={range.valid ? styles.valueText : styles.placeholderText}>
              {range.valid ? formatAmount(range.minN) : 'Enter amount'}
            </Text>
          </View>
          <View style={[styles.stepperButton, styles.stepperButtonAccent]}>
            <Text style={styles.stepperGlyph}>+</Text>
          </View>
        </View>
        <Text style={styles.currencyLabel}>{currency}</Text>
        <Text style={styles.rangeHelper}>{helper}</Text>
      </View>
    );
  }

  // Slider — payer picks a value; preview shows the snapped midpoint + thumb.
  const value = range.valid ? snapToStep((range.minN + range.maxN) / 2, range) : null;
  const fraction =
    value != null && range.maxN > range.minN
      ? (value - range.minN) / (range.maxN - range.minN)
      : 0;
  const knobLeft = fraction * (TRACK_WIDTH - KNOB_SIZE);
  return (
    <View style={styles.amountArea}>
      <View style={styles.valueBox}>
        <Text style={value != null ? styles.valueText : styles.placeholderText}>
          {value != null ? formatAmount(value) : 'Enter amount'}
        </Text>
      </View>
      <Text style={styles.currencyLabel}>{currency}</Text>
      <View style={styles.track}>
        <View style={[styles.trackFill, { width: knobLeft + KNOB_SIZE / 2 }]} />
        <View style={[styles.knob, { left: knobLeft }]} />
      </View>
      <Text style={styles.rangeHelper}>{helper}</Text>
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
  valueBox: {
    minWidth: 72,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
    backgroundColor: COLORS.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.cardBorder,
  },
  valueText: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.primaryText,
  },
  placeholderText: {
    fontSize: 16,
    color: COLORS.mutedText,
  },
  currencyLabel: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.5,
    color: COLORS.secondaryText,
    marginTop: 8,
  },
  rangeHelper: {
    fontSize: 12,
    color: COLORS.mutedText,
    marginTop: 12,
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
  // Slider mock
  track: {
    width: TRACK_WIDTH,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.cardBorder,
    justifyContent: 'center',
    marginTop: 16,
  },
  trackFill: {
    position: 'absolute',
    left: 0,
    height: 6,
    borderRadius: 3,
    backgroundColor: HachisuColors.cream,
  },
  knob: {
    position: 'absolute',
    width: KNOB_SIZE,
    height: KNOB_SIZE,
    borderRadius: KNOB_SIZE / 2,
    backgroundColor: HachisuColors.cream,
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
