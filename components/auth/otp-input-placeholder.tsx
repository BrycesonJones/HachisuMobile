import { useRef } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { COLORS } from '@/constants/colors';

interface OtpInputPlaceholderProps {
  value: string;
  onChange: (code: string) => void;
  length?: number;
}

export function OtpInputPlaceholder({ value, onChange, length = 6 }: OtpInputPlaceholderProps) {
  const inputRef = useRef<TextInput>(null);
  const digits = value.split('').slice(0, length);

  function handleChangeText(text: string) {
    const sanitized = text.replace(/\D/g, '').slice(0, length);
    onChange(sanitized);
  }

  function handleBoxPress() {
    inputRef.current?.focus();
  }

  return (
    <Pressable onPress={handleBoxPress} style={styles.wrapper} accessibilityRole="none">
      <View style={styles.boxRow}>
        {Array.from({ length }, (_, index) => {
          const digit = digits[index] ?? '';
          const isFocused = index === digits.length && digits.length < length;

          return (
            <View
              key={index}
              style={[styles.box, isFocused && styles.boxFocused, digit !== '' && styles.boxFilled]}>
              <Text style={styles.digit}>{digit}</Text>
            </View>
          );
        })}
      </View>
      <TextInput
        ref={inputRef}
        style={styles.hiddenInput}
        value={value}
        onChangeText={handleChangeText}
        keyboardType="number-pad"
        maxLength={length}
        autoFocus
        caretHidden
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'relative',
  },
  boxRow: {
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'center',
  },
  box: {
    width: 48,
    height: 56,
    borderRadius: 14,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxFocused: {
    borderColor: COLORS.secondaryText,
    backgroundColor: COLORS.cardBorder,
  },
  boxFilled: {
    borderColor: COLORS.cardBorder,
  },
  digit: {
    fontSize: 24,
    fontWeight: '600',
    color: COLORS.primaryText,
    textAlign: 'center',
    padding: 0,
  },
  hiddenInput: {
    position: 'absolute',
    opacity: 0,
    width: 1,
    height: 1,
  },
});
