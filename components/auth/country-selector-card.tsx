import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { COLORS } from '@/constants/colors';

interface CountrySelectorCardProps {
  label: string;
  /** The selected full country name, or null when nothing is chosen yet. */
  value: string | null;
  /** Shown in place of the value until a country is selected. */
  placeholder?: string;
  /**
   * The complete set of selectable full country names. The card offers exactly
   * these — no free text, no "Other" — so the caller's stored value stays
   * controlled by the list it supplies.
   */
  options: readonly string[];
  onSelect: (country: string) => void;
}

/**
 * Structured country selector: the card opens a bottom sheet listing the
 * supplied options (same sheet pattern as OptionSelectField /
 * CurrencySelect). Selection is the only way to produce a value.
 */
export function CountrySelectorCard({
  label,
  value,
  placeholder = 'Select a country',
  options,
  onSelect,
}: CountrySelectorCardProps) {
  const [open, setOpen] = useState(false);
  const insets = useSafeAreaInsets();

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.container, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel={`${label}, ${value ?? placeholder}. Tap to change.`}>
        <View style={styles.textBlock}>
          <Text style={styles.label}>{label}</Text>
          <Text style={value ? styles.value : styles.placeholder}>{value ?? placeholder}</Text>
        </View>
        <View style={styles.chevronButton}>
          <MaterialIcons name="keyboard-arrow-down" size={24} color={COLORS.primaryText} />
        </View>
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="slide"
        onRequestClose={() => setOpen(false)}
        statusBarTranslucent>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable
            style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}
            onPress={() => {}}
            accessibilityViewIsModal>
            <View style={styles.handleRow}>
              <View style={styles.handle} />
            </View>
            <Text style={styles.sheetTitle}>{label}</Text>

            <ScrollView
              style={styles.list}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
              bounces={false}>
              {options.map((option) => {
                const selected = option === value;
                return (
                  <Pressable
                    key={option}
                    onPress={() => {
                      onSelect(option);
                      setOpen(false);
                    }}
                    style={({ pressed }) => [styles.option, pressed && styles.optionPressed]}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    accessibilityLabel={option}>
                    <Text style={[styles.optionText, selected && styles.optionTextSelected]}>
                      {option}
                    </Text>
                    {selected ? (
                      <MaterialIcons name="check" size={20} color={COLORS.primary} />
                    ) : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.cardAlt,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    padding: 20,
  },
  pressed: {
    opacity: 0.8,
  },
  textBlock: {
    flex: 1,
    gap: 4,
  },
  label: {
    fontSize: 13,
    color: COLORS.secondaryText,
  },
  value: {
    fontSize: 18,
    fontWeight: '500',
    color: COLORS.primaryText,
  },
  placeholder: {
    fontSize: 18,
    fontWeight: '500',
    color: COLORS.mutedText,
  },
  chevronButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: COLORS.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 12,
    paddingTop: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.cardBorder,
  },
  handleRow: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.cardBorder,
  },
  sheetTitle: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.5,
    color: COLORS.secondaryText,
    paddingHorizontal: 12,
    paddingTop: 4,
    paddingBottom: 8,
  },
  list: {
    maxHeight: 420,
  },
  listContent: {
    paddingBottom: 8,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 52,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  optionPressed: {
    backgroundColor: COLORS.cardAlt,
  },
  optionText: {
    fontSize: 16,
    color: COLORS.primaryText,
  },
  optionTextSelected: {
    fontWeight: '600',
    color: COLORS.primary,
  },
});
