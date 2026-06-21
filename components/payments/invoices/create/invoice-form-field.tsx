import {
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import type { ReactNode } from 'react';

import { COLORS } from '@/constants/colors';

interface InvoiceFormFieldProps extends TextInputProps {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  required?: boolean;
  /** Inline validation message shown beneath the field. */
  error?: string | null;
  /** Optional trailing element inside the input row (e.g. a currency code). */
  rightSlot?: ReactNode;
}

/**
 * Labeled, rounded text field matching the Hachisu form style (see Create
 * Store). Large touch target, muted placeholder, optional required marker,
 * trailing slot, and an inline error line. Purely presentational.
 */
export function InvoiceFormField({
  label,
  value,
  onChangeText,
  required = false,
  error,
  rightSlot,
  ...inputProps
}: InvoiceFormFieldProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>
        {label}
        {required ? <Text style={styles.required}> *</Text> : null}
      </Text>
      <View style={[styles.inputRow, error ? styles.inputRowError : null]}>
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={onChangeText}
          placeholderTextColor={COLORS.mutedText}
          {...inputProps}
        />
        {rightSlot ? <View style={styles.rightSlot}>{rightSlot}</View> : null}
      </View>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
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
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 52,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.cardBorder,
    backgroundColor: COLORS.cardAlt,
  },
  inputRowError: {
    borderColor: '#F87171',
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: COLORS.primaryText,
    paddingVertical: 14,
    padding: 0,
  },
  rightSlot: {
    marginLeft: 10,
  },
  errorText: {
    marginTop: 6,
    fontSize: 13,
    color: '#F87171',
  },
});
