import { Pressable, StyleSheet, Text } from 'react-native';

import { COLORS } from '@/constants/colors';

interface PrimaryButtonProps {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}

export function PrimaryButton({ label, onPress, disabled = false }: PrimaryButtonProps) {
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      style={({ pressed }) => [
        styles.button,
        disabled ? styles.disabled : styles.enabled,
        pressed && !disabled && styles.pressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}>
      <Text style={[styles.text, disabled && styles.disabledText]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    borderRadius: 999,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  enabled: {
    backgroundColor: COLORS.whiteButton,
  },
  disabled: {
    backgroundColor: COLORS.disabled,
  },
  pressed: {
    opacity: 0.8,
  },
  text: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.background,
  },
  disabledText: {
    color: COLORS.secondaryText,
  },
});
