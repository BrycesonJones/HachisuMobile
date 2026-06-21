import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { PaymentFeatureCard } from '@/components/dashboard/payment-feature-card';
import {
  PAYMENT_FEATURES,
  type PaymentFeature,
} from '@/components/dashboard/payment-features';
import { DASHBOARD_COLORS } from '@/constants/dashboard-colors';

/**
 * Dashboard PAYMENTS section: a section label above a spacious 2x2 grid of
 * payment feature cards. Routes are driven entirely by PAYMENT_FEATURES, so this
 * stays purely presentational.
 */
export function PaymentFeaturesSection() {
  const router = useRouter();

  function handlePress(feature: PaymentFeature) {
    // Typed routes regenerate once the app/payments/* files exist; cast keeps
    // the metadata list decoupled from generated route literals.
    router.push(feature.route as never);
  }

  return (
    <View style={styles.root}>
      <Text style={styles.label}>PAYMENTS</Text>
      <View style={styles.grid}>
        {PAYMENT_FEATURES.map((feature) => (
          <PaymentFeatureCard
            key={feature.id}
            feature={feature}
            onPress={handlePress}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    paddingHorizontal: 20,
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1,
    color: DASHBOARD_COLORS.secondaryText,
    marginBottom: 14,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: 14,
    columnGap: 14,
  },
});
