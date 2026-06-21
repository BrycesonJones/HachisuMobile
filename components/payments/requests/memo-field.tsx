import { StyleSheet, Text, TextInput, View } from 'react-native';

import { COLORS } from '@/constants/colors';

interface MemoFieldProps {
  value: string;
  onChangeText: (text: string) => void;
  maxLength?: number;
}

/**
 * Optional, plain-text multi-line memo for a payment request. Deliberately NOT
 * a rich-text editor — no formatting, media, or uploads for MVP. Enforces a max
 * length natively and shows a live character counter.
 */
export function MemoField({ value, onChangeText, maxLength = 500 }: MemoFieldProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>Memo</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder="Add a note for the customer..."
        placeholderTextColor={COLORS.mutedText}
        multiline
        maxLength={maxLength}
        textAlignVertical="top"
        accessibilityLabel="Memo"
      />
      <View style={styles.footer}>
        <Text style={styles.helperText}>
          This note may be shown to the customer on the payment request page.
        </Text>
        <Text style={styles.counter}>
          {value.length}/{maxLength}
        </Text>
      </View>
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
  input: {
    minHeight: 120,
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 14,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.cardBorder,
    backgroundColor: COLORS.cardAlt,
    fontSize: 16,
    lineHeight: 22,
    color: COLORS.primaryText,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginTop: 8,
  },
  helperText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    color: COLORS.mutedText,
  },
  counter: {
    fontSize: 13,
    color: COLORS.mutedText,
    fontVariant: ['tabular-nums'],
  },
});
