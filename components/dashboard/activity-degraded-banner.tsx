import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { DASHBOARD_COLORS } from '@/constants/dashboard-colors';

interface ActivityDegradedBannerProps {
  message: string;
  /** Show a compact Retry action. Omit when nothing is retryable. */
  onRetry?: () => void;
}

/**
 * A non-blocking, non-alarming notice shown when the activity feed loaded but
 * some payment DETAILS could not be enriched. It never replaces the feed and is
 * visually distinct from the empty and full-error states so a degraded feed can
 * never be mistaken for a complete one (or for missing payments).
 */
export function ActivityDegradedBanner({ message, onRetry }: ActivityDegradedBannerProps) {
  return (
    <View style={styles.container} accessibilityRole="alert">
      <MaterialIcons name="info-outline" size={18} color={DASHBOARD_COLORS.warningText} />
      <Text style={styles.message}>{message}</Text>
      {onRetry ? (
        <Pressable
          onPress={onRetry}
          style={({ pressed }) => [styles.retry, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Retry loading payment details">
          <Text style={styles.retryLabel}>Retry</Text>
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
    marginHorizontal: 20,
    marginBottom: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: DASHBOARD_COLORS.warningBorder,
    backgroundColor: DASHBOARD_COLORS.warningBackground,
  },
  message: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    color: DASHBOARD_COLORS.warningText,
  },
  retry: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: DASHBOARD_COLORS.iconBackground,
  },
  retryLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: DASHBOARD_COLORS.primaryText,
  },
  pressed: {
    opacity: 0.7,
  },
});
