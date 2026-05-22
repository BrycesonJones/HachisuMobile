import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';

import { COLORS } from '@/constants/colors';

interface LabeledTextInputProps extends TextInputProps {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  showClearButton?: boolean;
}

export function LabeledTextInput({
  label,
  value,
  onChangeText,
  showClearButton = false,
  ...inputProps
}: LabeledTextInputProps) {
  function handleClear() {
    onChangeText('');
  }

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={onChangeText}
          placeholderTextColor={COLORS.mutedText}
          {...inputProps}
        />
        {showClearButton && value.length > 0 && (
          <Pressable
            onPress={handleClear}
            style={({ pressed }) => [styles.clearButton, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Clear input">
            <MaterialIcons name="close" size={16} color={COLORS.primaryText} />
          </Pressable>
        )}
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
  },
  input: {
    flex: 1,
    fontSize: 18,
    color: COLORS.primaryText,
    padding: 0,
  },
  clearButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.cardBorder,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  pressed: {
    opacity: 0.8,
  },
});
