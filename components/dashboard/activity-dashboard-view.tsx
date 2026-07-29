import { useRouter } from 'expo-router';

import { ActivityList } from '@/components/dashboard/activity-list';
import { useActiveStore } from '@/contexts/active-store-context';
import { useStoreActivity } from '@/hooks/use-store-activity';
import type { ActivityItem } from '@/types/activity';

/**
 * The Activity tab. Shows BTCPay-derived invoice/payment records for the ACTIVE
 * store only. When the active store changes the underlying hook clears and
 * refetches, so activity never leaks across stores.
 */
export function ActivityDashboardView() {
  const router = useRouter();
  const { activeMerchantStoreId } = useActiveStore();
  const { items, loading, refreshing, error, refetch } =
    useStoreActivity(activeMerchantStoreId);

  function handleItemPress(item: ActivityItem) {
    router.push({ pathname: '/activity-details', params: { id: item.id } });
  }

  return (
    <ActivityList
      items={items}
      loading={loading}
      refreshing={refreshing}
      error={error}
      onRefresh={refetch}
      onItemPress={handleItemPress}
    />
  );
}
