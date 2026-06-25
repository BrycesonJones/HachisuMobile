import { StyleSheet, Text, TextInput, View } from 'react-native';

import { COLORS } from '@/constants/colors';

interface CountedTextAreaProps {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  maxLength: number;
  helperText?: string;
}

/**
 * Generic plain-text multi-line input with a max length enforced natively and a
 * live character counter. No rich text or media. Reused across payment forms.
 */
export function CountedTextArea({
  label,
  value,
  onChangeText,
  placeholder,
  maxLength,
  helperText,
}: CountedTextAreaProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={COLORS.mutedText}
        multiline
        maxLength={maxLength}
        textAlignVertical="top"
        accessibilityLabel={label}
      />
      <View style={styles.footer}>
        {helperText ? <Text style={styles.helperText}>{helperText}</Text> : <View style={styles.spacer} />}
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
    minHeight: 110,
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
  spacer: {
    flex: 1,
  },
  counter: {
    fontSize: 13,
    color: COLORS.mutedText,
    fontVariant: ['tabular-nums'],
  },
});
