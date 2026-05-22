import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';

import { COLORS } from '@/constants/colors';

interface CloseButtonProps {
  onPress?: () => void;
}

export function CloseButton({ onPress }: CloseButtonProps) {
  const router = useRouter();

  function handlePress() {
    if (onPress) {
      onPress();
      return;
    }
    router.back();
  }

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel="Close">
      <MaterialIcons name="close" size={22} color={COLORS.primaryText} />
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
