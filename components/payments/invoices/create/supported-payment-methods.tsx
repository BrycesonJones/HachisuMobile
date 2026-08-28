import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { COLORS } from '@/constants/colors';
import { LIGHTNING_ENABLED } from '@/constants/feature-flags';
import { HachisuColors } from '@/constants/hachisu-colors';

export type TransactionCurrencyKey = 'lightning' | 'onchain';

export interface TransactionCurrencySelection {
  lightning: boolean;
  onchain: boolean;
}

interface SupportedPaymentMethodsProps {
  selection: TransactionCurrencySelection;
  onToggle: (key: TransactionCurrencyKey) => void;
}

// While the Lightning product gate is off, the Lightning row stays visible but
// is muted and inert — it can't be checked, so Lightning can't be requested as
// an invoice payment method.
const METHODS: readonly {
  key: TransactionCurrencyKey;
  label: string;
  gated: boolean;
  gatedSublabel?: string;
}[] = [
  { key: 'onchain', label: 'Bitcoin On-chain', gated: false },
  {
    key: 'lightning',
    label: LIGHTNING_ENABLED ? 'Bitcoin Lightning' : 'Bitcoin Lightning · Beta',
    gated: !LIGHTNING_ENABLED,
    gatedSublabel: 'Coming soon',
  },
];

/**
 * Selectable list of transaction currencies an invoice can be paid with. Each
 * row is a tap-friendly checkbox. The default payment method on checkout stays
 * read-only ("Store default") — that preference belongs in Store Settings, so
 * creating an invoice stays simple.
 */
export function SupportedPaymentMethods({
  selection,
  onToggle,
}: SupportedPaymentMethodsProps) {
  return (
    <View>
      <View style={styles.card}>
        {METHODS.map((method, index) => (
          <View key={method.key}>
            {index > 0 ? <View style={styles.divider} /> : null}
            <CheckboxRow
              label={method.label}
              sublabel={method.gated ? method.gatedSublabel : undefined}
              checked={!method.gated && selection[method.key]}
              disabled={method.gated}
              onToggle={() => onToggle(method.key)}
            />
          </View>
        ))}
      </View>

      <View style={styles.helperRow}>
        <MaterialIcons name="info-outline" size={16} color={COLORS.mutedText} />
        <Text style={styles.helperText}>Payment method: Store default</Text>
      </View>
    </View>
  );
}

interface CheckboxRowProps {
  label: string;
  sublabel?: string;
  checked: boolean;
  disabled?: boolean;
  onToggle: () => void;
}

function CheckboxRow({ label, sublabel, checked, disabled, onToggle }: CheckboxRowProps) {
  return (
    <Pressable
      onPress={disabled ? undefined : onToggle}
      disabled={disabled}
      style={({ pressed }) => [styles.row, pressed && !disabled && styles.pressed]}
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled: !!disabled }}
      accessibilityLabel={sublabel ? `${label}. ${sublabel}.` : label}>
      <View
        style={[
          styles.checkbox,
          checked && styles.checkboxChecked,
          disabled && styles.checkboxDisabled,
        ]}>
        {checked ? (
          <MaterialIcons name="check" size={16} color={HachisuColors.black} />
        ) : null}
      </View>
      <View style={styles.rowText}>
        <Text style={[styles.rowLabel, disabled && styles.rowLabelDisabled]}>{label}</Text>
        {sublabel ? <Text style={styles.rowSublabel}>{sublabel}</Text> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.cardBorder,
    backgroundColor: COLORS.cardAlt,
    paddingHorizontal: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 54,
    gap: 12,
  },
  pressed: {
    opacity: 0.6,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: COLORS.cardBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: HachisuColors.cream,
    borderColor: HachisuColors.cream,
  },
  checkboxDisabled: {
    opacity: 0.4,
  },
  rowText: {
    flex: 1,
  },
  rowLabel: {
    fontSize: 16,
    color: COLORS.primaryText,
  },
  rowLabelDisabled: {
    color: COLORS.mutedText,
  },
  rowSublabel: {
    marginTop: 2,
    fontSize: 12,
    color: COLORS.mutedText,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: COLORS.cardBorder,
  },
  helperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    paddingHorizontal: 4,
  },
  helperText: {
    fontSize: 13,
    color: COLORS.mutedText,
  },
});
