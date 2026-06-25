import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  formatPriceSummary,
  type PosProduct,
} from '@/components/payments/pos/products/product-types';
import { COLORS } from '@/constants/colors';
import { HachisuColors } from '@/constants/hachisu-colors';

interface ProductRowProps {
  product: PosProduct;
  onPress: () => void;
  onDelete: () => void;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

/**
 * Mobile product card. Generic initials avatar (no images for MVP), title with
 * a Disabled tag when off, price summary, and optional category / inventory
 * meta. Tapping opens the editor; the trash button deletes with confirmation
 * (handled by the parent).
 */
export function ProductRow({ product, onPress, onDelete }: ProductRowProps) {
  const hasInventory = product.inventory.trim() !== '';
  const hasCategory = product.category.trim() !== '';

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={`${product.name}, ${formatPriceSummary(product)}`}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{initials(product.name)}</Text>
      </View>

      <View style={styles.body}>
        <View style={styles.titleRow}>
          <Text style={styles.name} numberOfLines={1}>
            {product.name}
          </Text>
          {!product.enabled ? (
            <View style={styles.disabledTag}>
              <Text style={styles.disabledText}>Disabled</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.price}>{formatPriceSummary(product)}</Text>
        {hasCategory || hasInventory ? (
          <View style={styles.metaRow}>
            {hasCategory ? <Text style={styles.metaText}>{product.category}</Text> : null}
            {hasCategory && hasInventory ? <Text style={styles.metaDot}>·</Text> : null}
            {hasInventory ? (
              <Text style={styles.metaText}>{product.inventory} in stock</Text>
            ) : null}
          </View>
        ) : null}
      </View>

      <Pressable
        onPress={onDelete}
        style={({ pressed }) => [styles.deleteButton, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel={`Delete ${product.name}`}
        hitSlop={8}>
        <MaterialIcons name="delete-outline" size={20} color={COLORS.secondaryText} />
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 14,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.cardBorder,
    backgroundColor: COLORS.cardAlt,
  },
  pressed: {
    opacity: 0.7,
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 247, 230, 0.1)',
  },
  avatarText: {
    fontSize: 16,
    fontWeight: '700',
    color: HachisuColors.cream,
  },
  body: {
    flex: 1,
    gap: 3,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  name: {
    flexShrink: 1,
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.primaryText,
  },
  disabledTag: {
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 999,
    backgroundColor: COLORS.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.cardBorder,
  },
  disabledText: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.secondaryText,
  },
  price: {
    fontSize: 14,
    color: COLORS.secondaryText,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  metaText: {
    fontSize: 12,
    color: COLORS.mutedText,
  },
  metaDot: {
    fontSize: 12,
    color: COLORS.mutedText,
  },
  deleteButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
