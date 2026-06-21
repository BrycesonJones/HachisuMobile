import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { COLORS } from '@/constants/colors';

interface InvoiceSearchInputProps {
  value: string;
  onChangeText: (text: string) => void;
}

/**
 * Rounded, touch-friendly search field for the Invoices list. Leading search
 * icon, muted placeholder, and a clear button once text is entered. Updates
 * local UI state only — no fetching is wired up yet.
 */
export function InvoiceSearchInput({ value, onChangeText }: InvoiceSearchInputProps) {
  return (
    <View style={styles.container}>
      <MaterialIcons name="search" size={20} color={COLORS.secondaryText} />
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder="Search invoices..."
        placeholderTextColor={COLORS.mutedText}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        clearButtonMode="never"
        accessibilityLabel="Search invoices"
      />
      {value.length > 0 ? (
        <Pressable
          onPress={() => onChangeText('')}
          style={({ pressed }) => [styles.clearButton, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Clear search"
          hitSlop={8}>
          <MaterialIcons name="close" size={16} color={COLORS.primaryText} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 52,
    paddingHorizontal: 16,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.cardBorder,
    backgroundColor: COLORS.cardAlt,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: COLORS.primaryText,
    padding: 0,
  },
  clearButton: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: COLORS.cardBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.7,
  },
});
