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
  const { items, enrichment, loading, refreshing, error, refetch } =
    useStoreActivity(activeMerchantStoreId);

  function handleItemPress(item: ActivityItem) {
    // Route by DURABLE identifiers, never the in-memory item. The store is bound
    // to the record here (the list is store-scoped), so the detail screen fetches
    // this payment's store even if the active store changes later. `source` is
    // display-only — the backend derives the authoritative record type.
    if (!activeMerchantStoreId) return;
    router.push({
      pathname: '/activity-details',
      params: {
        merchantStoreId: activeMerchantStoreId,
        invoiceId: item.btcpayInvoiceId,
        source: item.sourceFeature,
      },
    });
  }

  return (
    <ActivityList
      items={items}
      enrichment={enrichment}
      loading={loading}
      refreshing={refreshing}
      error={error}
      onRefresh={refetch}
      onItemPress={handleItemPress}
    />
  );
}
