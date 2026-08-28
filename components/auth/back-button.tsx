import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter, type Href } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';

import { COLORS } from '@/constants/colors';

interface BackButtonProps {
  /**
   * Where to go when the screen has no history behind it — a URL restored after
   * a development reload, or a deep link. Going back is otherwise unhandled and
   * throws GO_BACK. Without a fallback the button is inert rather than throwing.
   */
  fallback?: Href;
}

export function BackButton({ fallback }: BackButtonProps = {}) {
  const router = useRouter();

  function handlePress() {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    if (fallback) {
      router.replace(fallback);
    }
  }

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel="Go back">
      <MaterialIcons name="chevron-left" size={24} color={COLORS.primaryText} />
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
