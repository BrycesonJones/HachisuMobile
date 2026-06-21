import { Pressable, StyleSheet, Text, View } from 'react-native';

import { COLORS } from '@/constants/colors';
import { HachisuColors } from '@/constants/hachisu-colors';

interface RequestEmptyStateProps {
  /** True when a search query or non-default filter is active. */
  filtered: boolean;
  onClearFilters: () => void;
}

/**
 * Minimal empty state for the Payment Requests list. An empty result reads the
 * same whether filtered or not — with All Status + All Time, no requests simply
 * means none match. A Clear filters link appears only when a filter is active.
 */
export function RequestEmptyState({ filtered, onClearFilters }: RequestEmptyStateProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.message}>
        There are no payment requests matching your criteria.
      </Text>
      {filtered ? (
        <Pressable
          onPress={onClearFilters}
          style={({ pressed }) => [styles.clearButton, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Clear filters">
          <Text style={styles.clearLabel}>Clear filters</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 8,
  },
  message: {
    fontSize: 15,
    lineHeight: 22,
    color: COLORS.secondaryText,
    textAlign: 'center',
  },
  clearButton: {
    marginTop: 14,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  clearLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: HachisuColors.cream,
  },
  pressed: {
    opacity: 0.6,
  },
});
