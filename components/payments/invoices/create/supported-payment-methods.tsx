import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { COLORS } from '@/constants/colors';
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

const METHODS: readonly { key: TransactionCurrencyKey; label: string }[] = [
  { key: 'onchain', label: 'Bitcoin On-chain' },
  { key: 'lightning', label: 'Bitcoin Lightning' },
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
              checked={selection[method.key]}
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
  checked: boolean;
  onToggle: () => void;
}

function CheckboxRow({ label, checked, onToggle }: CheckboxRowProps) {
  return (
    <Pressable
      onPress={onToggle}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={label}>
      <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
        {checked ? (
          <MaterialIcons name="check" size={16} color={HachisuColors.black} />
        ) : null}
      </View>
      <Text style={styles.rowLabel}>{label}</Text>
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
  rowLabel: {
    flex: 1,
    fontSize: 16,
    color: COLORS.primaryText,
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
