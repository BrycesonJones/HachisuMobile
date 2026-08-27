import { Pressable, StyleSheet, Text, View } from 'react-native';

import { COLORS } from '@/constants/colors';
import { HachisuColors } from '@/constants/hachisu-colors';
import type { PosMode } from '@/types/pos-app';

interface PosModeOption {
  id: PosMode;
  label: string;
  description: string;
}

// Merchant-facing modes only — BTCPay's Static/Cart/Light/Print never surface.
const OPTIONS: readonly PosModeOption[] = [
  {
    id: 'products',
    label: 'Products & Cart',
    description: 'Select products and quantities, then checkout.',
  },
  {
    id: 'quick-charge',
    label: 'Quick Charge',
    description: 'Enter an amount using a keypad.',
  },
];

interface PosModeSelectorProps {
  value: PosMode;
  onChange: (value: PosMode) => void;
  /** Disables both cards, e.g. while a mode change is being auto-saved. */
  disabled?: boolean;
}

/** Radio-card selector for the POS mode (same visual language as the other
 * Hachisu select cards). Selecting a card auto-saves the mode; the parent
 * disables the group while that save is in flight. */
export function PosModeSelector({ value, onChange, disabled = false }: PosModeSelectorProps) {
  return (
    <View style={styles.group} accessibilityRole="radiogroup" accessibilityLabel="POS mode">
      {OPTIONS.map((option) => {
        const selected = option.id === value;
        return (
          <Pressable
            key={option.id}
            onPress={() => onChange(option.id)}
            disabled={disabled}
            style={({ pressed }) => [
              styles.card,
              selected && styles.cardSelected,
              disabled && styles.cardDisabled,
              pressed && !disabled && styles.pressed,
            ]}
            accessibilityRole="radio"
            accessibilityState={{ selected, disabled, busy: disabled }}
            accessibilityLabel={option.label}
            accessibilityHint={option.description}>
            <View style={[styles.radioOuter, selected && styles.radioOuterSelected]}>
              {selected ? <View style={styles.radioInner} /> : null}
            </View>
            <View style={styles.body}>
              <Text style={[styles.label, selected && styles.labelSelected]}>
                {option.label}
              </Text>
              <Text style={styles.description}>{option.description}</Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  group: {
    gap: 10,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.cardBorder,
    backgroundColor: COLORS.cardAlt,
  },
  cardSelected: {
    borderColor: 'rgba(255, 247, 230, 0.5)',
    backgroundColor: 'rgba(255, 247, 230, 0.06)',
  },
  cardDisabled: {
    opacity: 0.5,
  },
  pressed: {
    opacity: 0.7,
  },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: COLORS.cardBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOuterSelected: {
    borderColor: HachisuColors.cream,
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: HachisuColors.cream,
  },
  body: {
    flex: 1,
    gap: 3,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.primaryText,
  },
  labelSelected: {
    color: HachisuColors.cream,
  },
  description: {
    fontSize: 13,
    color: COLORS.secondaryText,
    lineHeight: 18,
  },
});
