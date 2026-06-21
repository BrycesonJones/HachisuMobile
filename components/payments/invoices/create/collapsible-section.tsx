import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useState } from 'react';
import {
  LayoutAnimation,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  UIManager,
  View,
} from 'react-native';
import type { ReactNode } from 'react';

import { COLORS } from '@/constants/colors';

if (
  Platform.OS === 'android' &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface CollapsibleSectionProps {
  title: string;
  /** Collapsed on mount by default — preferred for mobile. */
  defaultExpanded?: boolean;
  children: ReactNode;
}

/**
 * Lightweight collapsible container used for optional, advanced form sections so
 * the primary form stays short. Animates open/closed and rotates a chevron.
 */
export function CollapsibleSection({
  title,
  defaultExpanded = false,
  children,
}: CollapsibleSectionProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  function toggle() {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded((prev) => !prev);
  }

  return (
    <View style={styles.card}>
      <Pressable
        onPress={toggle}
        style={({ pressed }) => [styles.header, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel={title}
        accessibilityState={{ expanded }}>
        <Text style={styles.title}>{title}</Text>
        <MaterialIcons
          name={expanded ? 'keyboard-arrow-up' : 'keyboard-arrow-down'}
          size={24}
          color={COLORS.secondaryText}
        />
      </Pressable>
      {expanded ? <View style={styles.body}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.cardBorder,
    backgroundColor: COLORS.cardAlt,
    paddingHorizontal: 16,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 56,
  },
  pressed: {
    opacity: 0.7,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.primaryText,
  },
  body: {
    paddingBottom: 16,
  },
});
