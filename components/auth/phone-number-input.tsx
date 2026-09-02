import { StyleSheet, Text, TextInput, View } from 'react-native';

import { COLORS } from '@/constants/colors';

interface PhoneNumberInputProps {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  /**
   * International calling code and flag shown beside the input. The defaults
   * keep legacy call sites (the post-auth account phone editor) on their
   * existing US presentation; country-aware screens pass the metadata for the
   * user's selected country (see constants/supported-countries.ts).
   */
  callingCode?: string;
  flag?: string;
}

export function PhoneNumberInput({
  label,
  value,
  onChangeText,
  placeholder = '201-555-0123',
  callingCode = '+1',
  flag = '🇺🇸',
}: PhoneNumberInputProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.inputRow}>
        <Text style={styles.countryCode}>{callingCode}</Text>
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={COLORS.mutedText}
          keyboardType="phone-pad"
          autoComplete="tel"
        />
        <Text style={styles.flag}>{flag}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.card,
    borderRadius: 26,
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 16,
  },
  label: {
    fontSize: 13,
    color: COLORS.secondaryText,
    marginBottom: 4,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  countryCode: {
    fontSize: 18,
    color: COLORS.primaryText,
    fontWeight: '500',
  },
  input: {
    flex: 1,
    fontSize: 18,
    color: COLORS.primaryText,
    padding: 0,
  },
  flag: {
    fontSize: 24,
  },
});
