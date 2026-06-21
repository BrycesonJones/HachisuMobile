import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { COLORS } from '@/constants/colors';
import { HachisuColors } from '@/constants/hachisu-colors';

export interface SelectOption {
  id: string;
  label: string;
}

interface OptionSelectFieldProps {
  label: string;
  options: readonly SelectOption[];
  selectedId: string;
  onChange: (id: string) => void;
  required?: boolean;
  /** Optional helper text rendered beneath the field. */
  helperText?: string;
}

/**
 * Labeled, form-style selector that opens a mobile bottom sheet of options.
 * Large touch target matching the Hachisu form fields — used for Expiration and
 * customer-data selectors on the Create Payment Request screen.
 */
export function OptionSelectField({
  label,
  options,
  selectedId,
  onChange,
  required = false,
  helperText,
}: OptionSelectFieldProps) {
  const [open, setOpen] = useState(false);
  const insets = useSafeAreaInsets();

  const selectedLabel =
    options.find((option) => option.id === selectedId)?.label ?? options[0].label;

  return (
    <View style={styles.container}>
      <Text style={styles.label}>
        {label}
        {required ? <Text style={styles.required}> *</Text> : null}
      </Text>

      <Pressable
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.field, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${selectedLabel}. Tap to change.`}>
        <Text style={styles.fieldValue} numberOfLines={1}>
          {selectedLabel}
        </Text>
        <MaterialIcons
          name="keyboard-arrow-down"
          size={22}
          color={COLORS.secondaryText}
        />
      </Pressable>

      {helperText ? <Text style={styles.helperText}>{helperText}</Text> : null}

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
                const selected = option.id === selectedId;
                return (
                  <Pressable
                    key={option.id}
                    onPress={() => {
                      onChange(option.id);
                      setOpen(false);
                    }}
                    style={({ pressed }) => [
                      styles.option,
                      pressed && styles.optionPressed,
                    ]}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    accessibilityLabel={option.label}>
                    <Text
                      style={[styles.optionText, selected && styles.optionTextSelected]}>
                      {option.label}
                    </Text>
                    {selected ? (
                      <MaterialIcons name="check" size={20} color={HachisuColors.cream} />
                    ) : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 18,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.primaryText,
    marginBottom: 8,
  },
  required: {
    color: COLORS.primary,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 52,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.cardBorder,
    backgroundColor: COLORS.cardAlt,
  },
  pressed: {
    opacity: 0.7,
  },
  fieldValue: {
    flexShrink: 1,
    fontSize: 16,
    color: COLORS.primaryText,
  },
  helperText: {
    fontSize: 13,
    color: COLORS.mutedText,
    marginTop: 8,
    lineHeight: 18,
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
    maxHeight: 360,
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
    color: HachisuColors.cream,
  },
});
