import { useFocusEffect } from '@react-navigation/native';
import { useCallback } from 'react';
import { StatusBar, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ActivityDashboardView } from '@/components/dashboard/activity-dashboard-view';
import { BitcoinDashboardView } from '@/components/dashboard/bitcoin-dashboard-view';
import { useDashboardTab } from '@/components/dashboard/dashboard-tab-context';
import { DASHBOARD_COLORS } from '@/constants/dashboard-colors';
import { useActiveStore } from '@/contexts/active-store-context';
import { bitcoinBalance } from '@/data/bitcoin-balance';

export default function MerchantDashboardScreen() {
  const { activeTab } = useDashboardTab();
  const { refetch } = useActiveStore();

  // Refetch stores whenever the dashboard regains focus, so wallet status
  // reflects changes made in the setup flow (which returns here on completion).
  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch]),
  );

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="light-content" />

      <View style={styles.content}>
        {activeTab === 'activity' ? (
          <Animated.View key="activity" entering={FadeIn.duration(200)} style={styles.view}>
            <ActivityDashboardView />
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
