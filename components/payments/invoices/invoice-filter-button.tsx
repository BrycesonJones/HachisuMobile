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
import {
  optionLabel,
  type InvoiceFilterOption,
} from '@/components/payments/invoices/invoice-filters';

interface InvoiceFilterButtonProps {
  /** Sheet title and accessibility label, e.g. "Status" or "Time". */
  title: string;
  options: readonly InvoiceFilterOption[];
  selectedId: string;
  onChange: (id: string) => void;
}

/**
 * A tap-friendly filter pill that opens a mobile bottom sheet of options. The
 * pill highlights (cream accent) when a non-default option is selected so active
 * filters read clearly. Encapsulates its own sheet so screens just pass state.
 */
export function InvoiceFilterButton({
  title,
  options,
  selectedId,
  onChange,
}: InvoiceFilterButtonProps) {
  const [open, setOpen] = useState(false);
  const insets = useSafeAreaInsets();

  const isActive = selectedId !== options[0].id;
  const label = optionLabel(options, selectedId);

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        style={({ pressed }) => [
          styles.pill,
          isActive && styles.pillActive,
          pressed && styles.pressed,
        ]}
        accessibilityRole="button"
        accessibilityLabel={`${title} filter: ${label}. Tap to change.`}>
        <Text
          style={[styles.pillLabel, isActive && styles.pillLabelActive]}
          numberOfLines={1}>
          {label}
        </Text>
        <MaterialIcons
          name="keyboard-arrow-down"
          size={20}
          color={isActive ? HachisuColors.cream : COLORS.secondaryText}
        />
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
            <Text style={styles.sheetTitle}>{title}</Text>

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
                      <MaterialIcons
                        name="check"
                        size={20}
                        color={HachisuColors.cream}
                      />
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
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    height: 48,
    paddingHorizontal: 16,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.cardBorder,
    backgroundColor: COLORS.cardAlt,
  },
  pillActive: {
    borderColor: 'rgba(255, 247, 230, 0.4)',
    backgroundColor: 'rgba(255, 247, 230, 0.08)',
  },
  pressed: {
    opacity: 0.7,
  },
  pillLabel: {
    flexShrink: 1,
    fontSize: 15,
    fontWeight: '500',
    color: COLORS.primaryText,
  },
  pillLabelActive: {
    color: HachisuColors.cream,
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
    color: HachisuColors.cream,
  },
});
