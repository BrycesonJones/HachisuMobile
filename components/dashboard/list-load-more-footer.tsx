import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { DASHBOARD_COLORS } from '@/constants/dashboard-colors';

interface ListLoadMoreFooterProps {
  hasMore: boolean;
  loadingMore: boolean;
  /** Present when the LAST load-more attempt failed. The already-loaded rows
   * stay visible; only the tail is retried. */
  error: string | null;
  itemCount: number;
  label: string;
  onLoadMore: () => void;
}

/**
 * Footer for a cursor-paginated list. Distinguishes the three tail states —
 * more history available, a failed load-more, and history exhausted — so a
 * truncated list is never silently presented as the whole record.
 */
export function ListLoadMoreFooter({
  hasMore,
  loadingMore,
  error,
  itemCount,
  label,
  onLoadMore,
}: ListLoadMoreFooterProps) {
  if (itemCount === 0) return null;

  if (loadingMore) {
    return (
      <View style={styles.container}>
        <ActivityIndicator color={DASHBOARD_COLORS.primaryText} />
      </View>
    );
  }

  if (!hasMore) {
    return (
      <View style={styles.container}>
        <Text style={styles.endText}>End of history</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      <Pressable
        onPress={onLoadMore}
        style={({ pressed }) => [styles.button, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel={error ? `Retry loading more ${label}` : `Load older ${label}`}>
        <Text style={styles.buttonLabel}>{error ? 'Try again' : `Load older ${label}`}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: 24,
    paddingHorizontal: 32,
    gap: 10,
  },
  button: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 999,
    backgroundColor: DASHBOARD_COLORS.iconBackground,
  },
  pressed: {
    opacity: 0.7,
  },
  buttonLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: DASHBOARD_COLORS.primaryText,
  },
  endText: {
    fontSize: 13,
    color: DASHBOARD_COLORS.mutedText,
  },
  errorText: {
    fontSize: 13,
    color: DASHBOARD_COLORS.warningText,
    textAlign: 'center',
  },
});
