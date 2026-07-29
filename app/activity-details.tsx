import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { ActivityDetailView } from '@/components/dashboard/activity-detail-view';
import { DASHBOARD_COLORS } from '@/constants/dashboard-colors';
import { getCachedActivityItem } from '@/lib/btcpay/activity-cache';

export default function ActivityDetailsScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const item = typeof id === 'string' ? getCachedActivityItem(id) : undefined;

  useEffect(() => {
    if (id != null && item == null) {
      router.back();
    }
  }, [id, router, item]);

  if (!item) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={DASHBOARD_COLORS.primaryText} />
      </View>
    );
  }

  function handleClose() {
    router.back();
  }

  return <ActivityDetailView item={item} onClose={handleClose} />;
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: DASHBOARD_COLORS.background,
  },
});
