import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter, type Href } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';

import { COLORS } from '@/constants/colors';

interface BackButtonProps {
  /**
   * Where to go when nothing is behind this screen. Post-auth routing resumes a
   * user with `replace`, which swaps the landing screen for their next step
   * rather than pushing onto it, so that step can be the only route in the
   * stack — going back there is unhandled and logs a GO_BACK error. Screens
   * without a meaningful earlier step omit this and the button simply does
   * nothing.
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
