import { useRouter } from 'expo-router';

import { ActivityList } from '@/components/dashboard/activity-list';
import { useActiveStore } from '@/contexts/active-store-context';
import { useStoreActivity } from '@/hooks/use-store-activity';
import type { StoreActivityEvent } from '@/types/activity';

/**
 * The Activity tab. Shows BTCPay PAYMENT records — actual money movement — for
 * the ACTIVE store only. When the active store changes the underlying hook
 * clears and refetches, so activity never leaks across stores.
 */
export function ActivityDashboardView() {
  const router = useRouter();
  const { activeMerchantStoreId } = useActiveStore();
  const { items, loading, refreshing, loadingMore, hasMore, error, refresh, loadMore } =
    useStoreActivity(activeMerchantStoreId);

  function handleItemPress(event: StoreActivityEvent) {
    // Route by DURABLE identifiers, never the in-memory record. The store is
    // bound to the payment here (the list is store-scoped), so the detail screen
    // fetches this payment's store even if the active store changes later.
    // `paymentId` selects the right transaction on a multi-payment invoice.
    if (!activeMerchantStoreId) return;
    router.push({
      pathname: '/activity-details',
      params: {
        merchantStoreId: activeMerchantStoreId,
        invoiceId: event.btcpayInvoiceId,
        paymentId: event.paymentId,
      },
    });
  }

  return (
    <ActivityList
      events={items}
      merchantStoreId={activeMerchantStoreId}
      loading={loading}
      refreshing={refreshing}
      loadingMore={loadingMore}
      hasMore={hasMore}
      error={error}
      onRefresh={refresh}
      onLoadMore={loadMore}
      onItemPress={handleItemPress}
    />
  );
}
