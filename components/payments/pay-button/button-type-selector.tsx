import { Pressable, StyleSheet, Text, View } from 'react-native';

import { COLORS } from '@/constants/colors';
import { HachisuColors } from '@/constants/hachisu-colors';

export type PayButtonType = 'fixed' | 'custom' | 'slider';

interface ButtonTypeOption {
  id: PayButtonType;
  title: string;
  description: string;
}

const OPTIONS: readonly ButtonTypeOption[] = [
  { id: 'fixed', title: 'Fixed amount', description: 'Customer chooses how much to pay.' },
  { id: 'custom', title: 'Custom amount', description: 'Customer pays the amount you set.' },
  { id: 'slider', title: 'Slider', description: 'Customer chooses an amount within a range.' },
];

interface ButtonTypeSelectorProps {
  value: PayButtonType;
  onChange: (value: PayButtonType) => void;
}

/**
 * Radio-card selector for the Pay Button amount mode. Mobile-friendly tap
 * targets, cream accent on the selected card.
 */
export function ButtonTypeSelector({ value, onChange }: ButtonTypeSelectorProps) {
  return (
    <View style={styles.group}>
      {OPTIONS.map((option) => {
        const selected = option.id === value;
        return (
          <Pressable
            key={option.id}
            onPress={() => onChange(option.id)}
            style={({ pressed }) => [
              styles.card,
              selected && styles.cardSelected,
              pressed && styles.pressed,
            ]}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={option.title}
            accessibilityHint={option.description}>
            <View style={[styles.radioOuter, selected && styles.radioOuterSelected]}>
              {selected ? <View style={styles.radioInner} /> : null}
            </View>
            <View style={styles.textBlock}>
              <Text style={styles.title}>{option.title}</Text>
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
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.cardBorder,
    backgroundColor: COLORS.cardAlt,
  },
  cardSelected: {
    borderColor: 'rgba(255, 247, 230, 0.5)',
    backgroundColor: 'rgba(255, 247, 230, 0.06)',
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
    width: 11,
    height: 11,
    borderRadius: 6,
    backgroundColor: HachisuColors.cream,
  },
  textBlock: {
    flex: 1,
    gap: 3,
  },
  title: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.primaryText,
  },
  description: {
    fontSize: 13,
    lineHeight: 18,
    color: COLORS.secondaryText,
  },
});
