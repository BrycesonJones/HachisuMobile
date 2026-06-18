import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';

import { COLORS } from '@/constants/colors';

/**
 * Top-right "X" that exits a multi-step setup flow entirely, returning to the
 * dashboard — as opposed to BackButton, which steps back one screen.
 */
export function CloseFlowButton() {
  const router = useRouter();

  return (
    <Pressable
      onPress={() => router.dismissTo('/(tabs)/home')}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel="Close"
      hitSlop={8}>
      <MaterialIcons name="close" size={24} color={COLORS.primaryText} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.8,
  },
});
