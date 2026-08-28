import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter, type Href } from 'expo-router';
import { useCallback, useEffect, useRef } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { COLORS } from '@/constants/colors';

interface CloseButtonProps {
  onPress?: () => void;
  /** Where to go when nothing is behind this screen. See BackButton. */
  fallback?: Href;
  /** Spoken description of what closing does. The icon alone is not a description,
   * so screens that close to a specific destination should say so. */
  accessibilityLabel?: string;
}

/** iOS Human Interface Guidelines minimum interactive size. The visible circle
 * stays smaller (40) so the design is unchanged — only the tappable area grows. */
const TOUCH_TARGET = 44;
const CIRCLE = 40;

/** How long a press is ignored after one fires. Long enough to swallow a
 * double tap, short enough that the control recovers if navigation didn't
 * actually happen — it must never latch permanently disabled. */
const REPEAT_GUARD_MS = 700;

export function CloseButton({
  onPress,
  fallback,
  accessibilityLabel = 'Close',
}: CloseButtonProps) {
  const router = useRouter();
  const lockedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const handlePress = useCallback(() => {
    // One navigation per tap: a fast double tap on a close control would
    // otherwise pop two screens.
    if (lockedRef.current) return;
    lockedRef.current = true;
    timerRef.current = setTimeout(() => {
      lockedRef.current = false;
    }, REPEAT_GUARD_MS);

    if (onPress) {
      onPress();
      return;
    }
    if (router.canGoBack()) {
      router.back();
      return;
    }
    if (fallback) {
      router.replace(fallback);
    }
  }, [fallback, onPress, router]);

  return (
    <Pressable
      onPress={handlePress}
      style={styles.touchTarget}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}>
      {({ pressed }) => (
        <View style={[styles.circle, pressed && styles.pressed]}>
          <MaterialIcons name="close" size={22} color={COLORS.primaryText} />
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  touchTarget: {
    width: TOUCH_TARGET,
    height: TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    // Keep the visual circle flush with the screen's leading edge even though the
    // touch target is wider than it.
    marginLeft: -(TOUCH_TARGET - CIRCLE) / 2,
  },
  circle: {
    width: CIRCLE,
    height: CIRCLE,
    borderRadius: CIRCLE / 2,
    backgroundColor: COLORS.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.8,
  },
});
