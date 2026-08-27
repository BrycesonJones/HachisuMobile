import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { posModeFromStyle, posModeLabel, type PosApp } from '@/types/pos-app';
import { COLORS } from '@/constants/colors';
import { HachisuColors } from '@/constants/hachisu-colors';

interface PosAppRowProps {
  app: PosApp;
  onPress: () => void;
}

/** Mobile card for a created POS app. Tapping opens its Update POS page. */
export function PosAppRow({ app, onPress }: PosAppRowProps) {
  const title = app.display_title || app.app_name;
  const hasDescription = (app.description ?? '').trim().length > 0;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={title}>
      <View style={styles.iconBadge}>
        <MaterialIcons name="storefront" size={22} color={HachisuColors.cream} />
      </View>

      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {posModeLabel(posModeFromStyle(app.pos_style))} · {app.currency}
        </Text>
        {hasDescription ? (
          <Text style={styles.description} numberOfLines={1}>
            {app.description}
          </Text>
        ) : null}
      </View>

      <MaterialIcons name="chevron-right" size={22} color={COLORS.secondaryText} />
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
  iconBadge: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 247, 230, 0.1)',
  },
  body: {
    flex: 1,
    gap: 3,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.primaryText,
  },
  meta: {
    fontSize: 13,
    color: COLORS.secondaryText,
  },
  description: {
    fontSize: 13,
    color: COLORS.mutedText,
  },
});
