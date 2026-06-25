import { Pressable, StyleSheet, Text, View } from 'react-native';

import { COLORS } from '@/constants/colors';
import { HachisuColors } from '@/constants/hachisu-colors';
import type { ProductPriceType } from '@/components/payments/pos/products/product-types';

interface PriceTypeOption {
  id: ProductPriceType;
  label: string;
}

const OPTIONS: readonly PriceTypeOption[] = [
  { id: 'fixed', label: 'Fixed' },
  { id: 'free', label: 'Free' },
  { id: 'any', label: 'Any amount' },
  { id: 'minimum', label: 'Minimum amount' },
];

interface PriceTypeSelectorProps {
  value: ProductPriceType;
  onChange: (value: ProductPriceType) => void;
}

/**
 * Compact chip selector for the product price type. Wraps to two rows on narrow
 * screens; selected chip uses the cream accent.
 */
export function PriceTypeSelector({ value, onChange }: PriceTypeSelectorProps) {
  return (
    <View style={styles.row}>
      {OPTIONS.map((option) => {
        const selected = option.id === value;
        return (
          <Pressable
            key={option.id}
            onPress={() => onChange(option.id)}
            style={({ pressed }) => [
              styles.chip,
              selected && styles.chipSelected,
              pressed && styles.pressed,
            ]}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={option.label}>
            <Text style={[styles.chipLabel, selected && styles.chipLabelSelected]}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  chip: {
    paddingVertical: 11,
    paddingHorizontal: 18,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.cardBorder,
    backgroundColor: COLORS.cardAlt,
  },
  chipSelected: {
    borderColor: 'rgba(255, 247, 230, 0.5)',
    backgroundColor: 'rgba(255, 247, 230, 0.08)',
  },
  pressed: {
    opacity: 0.7,
  },
  chipLabel: {
    fontSize: 15,
    fontWeight: '500',
    color: COLORS.secondaryText,
  },
  chipLabelSelected: {
    color: HachisuColors.cream,
    fontWeight: '600',
  },
});
