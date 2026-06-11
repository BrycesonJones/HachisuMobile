import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text } from 'react-native';

import { COLORS } from '@/constants/colors';
import { SUPPORTED_CURRENCIES, currencyLabel } from '@/constants/currencies';

interface CurrencySelectProps {
  value: string;
  onChange: (code: string) => void;
}

// Currency picker. Backed by SUPPORTED_CURRENCIES (USD today) and built to grow
// — adding currencies to the constant is all that's needed.
export function CurrencySelect({ value, onChange }: CurrencySelectProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.field, pressed && styles.fieldPressed]}
        accessibilityRole="button"
        accessibilityLabel={`Default currency: ${value}. Tap to change.`}>
        <Text style={styles.fieldValue}>
          {value} · {currencyLabel(value)}
        </Text>
        <MaterialIcons name="expand-more" size={22} color={COLORS.secondaryText} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <Text style={styles.sheetTitle}>Default currency</Text>
            {SUPPORTED_CURRENCIES.map((c) => {
              const selected = c.code === value;
              return (
                <Pressable
                  key={c.code}
                  onPress={() => {
                    onChange(c.code);
                    setOpen(false);
                  }}
                  style={({ pressed }) => [styles.option, pressed && styles.fieldPressed]}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}>
                  <Text style={styles.optionText}>
                    {c.code} · {c.label}
                  </Text>
                  {selected ? (
                    <MaterialIcons name="check" size={20} color={COLORS.primary} />
                  ) : null}
                </Pressable>
              );
            })}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 52,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.cardBorder,
    backgroundColor: COLORS.cardAlt,
  },
  fieldPressed: {
    opacity: 0.7,
  },
  fieldValue: {
    fontSize: 16,
    color: COLORS.primaryText,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  sheet: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    paddingVertical: 8,
    paddingHorizontal: 8,
  },
  sheetTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.secondaryText,
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 6,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 48,
    paddingHorizontal: 10,
    borderRadius: 10,
  },
  optionText: {
    fontSize: 16,
    color: COLORS.primaryText,
  },
});
