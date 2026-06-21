import { Pressable, StyleSheet, Text, View } from 'react-native';

import { COLORS } from '@/constants/colors';
import { HachisuColors } from '@/constants/hachisu-colors';

interface InvoiceEmptyStateProps {
  /** True when a search query or non-default filter is active. */
  filtered: boolean;
  onClearFilters: () => void;
}

/**
 * Minimal empty state for the Invoices list. Whether the list is unfiltered or
 * filtered, an empty result reads the same way ("nothing matches your
 * criteria") — with All Status + All Time, no invoices simply means none match.
 * A Clear filters link appears only when a non-default filter is active.
 */
export function InvoiceEmptyState({ filtered, onClearFilters }: InvoiceEmptyStateProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.message}>There are no invoices matching your criteria.</Text>
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
