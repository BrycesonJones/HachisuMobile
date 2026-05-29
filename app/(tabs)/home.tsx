import { useRouter } from 'expo-router';
import { StatusBar, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ActivityDashboardView } from '@/components/dashboard/activity-dashboard-view';
import { BitcoinDashboardView } from '@/components/dashboard/bitcoin-dashboard-view';
import { useDashboardTab } from '@/components/dashboard/dashboard-tab-context';
import { DASHBOARD_COLORS } from '@/constants/dashboard-colors';
import { bitcoinBalance } from '@/data/bitcoin-balance';
import type { Transaction } from '@/types/transaction';

export default function MerchantDashboardScreen() {
  const router = useRouter();
  const { activeTab } = useDashboardTab();

  function handleTransactionPress(transaction: Transaction) {
    router.push({
      pathname: '/transaction-details',
      params: { id: transaction.id },
    });
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="light-content" />

      <View style={styles.content}>
        {activeTab === 'activity' ? (
          <Animated.View key="activity" entering={FadeIn.duration(200)} style={styles.view}>
            <ActivityDashboardView onTransactionPress={handleTransactionPress} />
          </Animated.View>
        ) : (
          <Animated.View key="bitcoin" entering={FadeIn.duration(200)} style={styles.view}>
            <BitcoinDashboardView balance={bitcoinBalance} />
          </Animated.View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: DASHBOARD_COLORS.background,
  },
  content: {
    flex: 1,
  },
  view: {
    flex: 1,
  },
});
