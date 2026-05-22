import { StyleSheet, Text, TextInput, View } from 'react-native';

import { COLORS } from '@/constants/colors';

interface PhoneNumberInputProps {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
}

export function PhoneNumberInput({
  label,
  value,
  onChangeText,
  placeholder = '201-555-0123',
}: PhoneNumberInputProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.inputRow}>
        <Text style={styles.countryCode}>+1</Text>
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={COLORS.mutedText}
          keyboardType="phone-pad"
          autoComplete="tel"
        />
        <Text style={styles.flag}>🇺🇸</Text>
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
