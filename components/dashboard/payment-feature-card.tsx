import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { DASHBOARD_COLORS } from '@/constants/dashboard-colors';
import { HachisuColors } from '@/constants/hachisu-colors';
import type { PaymentFeature } from '@/components/dashboard/payment-features';

interface PaymentFeatureCardProps {
  feature: PaymentFeature;
  onPress: (feature: PaymentFeature) => void;
}

/**
 * A single, tap-friendly card in the dashboard PAYMENTS grid. Dark frosted
 * surface with a rounded orange-tinted icon badge, a white label, a muted
 * subtitle, and a subtle orange chevron. Pressed state dims the whole card.
 */
export function PaymentFeatureCard({ feature, onPress }: PaymentFeatureCardProps) {
  return (
    <Pressable
      onPress={() => onPress(feature)}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={feature.title}
      accessibilityHint={feature.accessibilityHint}>
      <View style={styles.iconBadge}>
        <MaterialIcons name={feature.icon} size={24} color={HachisuColors.cream} />
      </View>

      <View style={styles.body}>
        <View style={styles.titleRow}>
          <Text style={styles.title} numberOfLines={1}>
            {feature.title}
          </Text>
          <MaterialIcons
            name="chevron-right"
            size={20}
            color={HachisuColors.cream}
          />
        </View>
        <Text style={styles.subtitle} numberOfLines={1}>
          {feature.subtitle}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexGrow: 1,
    flexBasis: '47%',
    minHeight: 156,
    borderRadius: 22,
    padding: 18,
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  pressed: {
    opacity: 0.6,
  },
  iconBadge: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  body: {
    gap: 4,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  title: {
    flexShrink: 1,
    fontSize: 17,
    fontWeight: '600',
    color: DASHBOARD_COLORS.primaryText,
  },
  subtitle: {
    fontSize: 13,
    fontWeight: '500',
    color: DASHBOARD_COLORS.secondaryText,
  },
});
