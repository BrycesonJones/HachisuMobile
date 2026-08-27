import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  Pressable,
  RefreshControl,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PrimaryButton } from '@/components/auth/primary-button';
import { ListLoadMoreFooter } from '@/components/dashboard/list-load-more-footer';
import { InvoiceEmptyState } from '@/components/payments/invoices/invoice-empty-state';
import { InvoiceFilterButton } from '@/components/payments/invoices/invoice-filter-button';
import {
  DEFAULT_STATUS_ID,
  DEFAULT_TIME_ID,
  STATUS_OPTIONS,
  TIME_OPTIONS,
  timeFilterStartDate,
} from '@/components/payments/invoices/invoice-filters';
import { InvoiceRow } from '@/components/payments/invoices/invoice-row';
import { InvoiceSearchInput } from '@/components/payments/invoices/invoice-search-input';
import { COLORS } from '@/constants/colors';
import { useActiveStore } from '@/contexts/active-store-context';
import { useStoreInvoices } from '@/hooks/use-store-invoices';
import type { InvoiceStatusFilterId } from '@/lib/btcpay/invoice-list';
import type { ActivityItem } from '@/types/activity';

const CREATE_INVOICE_ROUTE = '/payments/invoices/create';

/**
 * The Invoices screen: the active BTCPay store's REAL invoice history.
 *
 * Every invoice in the store appears here regardless of which client created it
 * — Hachisu, the BTCPay web UI, POS, Pay Button, or an outside integration —
 * because the list is read from BTCPay rather than from Hachisu's own records.
 * Status, time, and text filtering all execute server-side against BTCPay's own
 * query parameters, and history is walked with a cursor, so the phone never
 * holds (or filters) an unbounded invoice history.
 */
export default function InvoicesScreen() {
  const router = useRouter();
  const { activeStore, activeMerchantStoreId } = useActiveStore();

  const [search, setSearch] = useState('');
  const [statusId, setStatusId] = useState<InvoiceStatusFilterId>(DEFAULT_STATUS_ID);
  const [timeId, setTimeId] = useState(DEFAULT_TIME_ID);

  // Recomputed only when the time filter changes, so an already-loaded list is
  // not reset on every render by a moving "now".
  const startDate = useMemo(() => timeFilterStartDate(timeId), [timeId]);

  const {
    items,
    loading,
    refreshing,
    loadingMore,
    hasMore,
    error,
    refresh,
    loadMore,
  } = useStoreInvoices(activeMerchantStoreId, {
    statusFilter: statusId,
    search,
    startDate,
  });

  const isFiltered =
    search.trim().length > 0 ||
    statusId !== DEFAULT_STATUS_ID ||
    timeId !== DEFAULT_TIME_ID;
  const isEmpty = items.length === 0;
  // With rows on screen, a failure belongs to the tail (a failed load-more).
  const listError = isEmpty ? error : null;
  const footerError = isEmpty ? null : error;

  const goToCreate = useCallback(() => {
    Keyboard.dismiss();
    router.push(CREATE_INVOICE_ROUTE as never);
  }, [router]);

  const clearFilters = useCallback(() => {
    setSearch('');
    setStatusId(DEFAULT_STATUS_ID);
    setTimeId(DEFAULT_TIME_ID);
  }, []);

  const openInvoice = useCallback(
    (invoice: ActivityItem) => {
      // Route by durable identifiers bound to the store the record belongs to,
      // so the detail screen is correct even if the active store changes later.
      if (!activeMerchantStoreId) return;
      router.push({
        pathname: '/activity-details',
        params: {
          merchantStoreId: activeMerchantStoreId,
          invoiceId: invoice.btcpayInvoiceId,
        },
      });
    },
    [router, activeMerchantStoreId],
  );

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="light-content" />

      <View style={styles.headerRow}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={8}>
          <MaterialIcons name="chevron-left" size={24} color={COLORS.primaryText} />
        </Pressable>
        <View style={styles.headerSpacer} />
      </View>

      <FlatList
        data={items}
        keyExtractor={(invoice) => invoice.btcpayInvoiceId}
        renderItem={({ item }) => <InvoiceRow invoice={item} onPress={openInvoice} />}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refresh}
            tintColor={COLORS.primaryText}
            colors={[COLORS.primaryText]}
          />
        }
        onEndReached={hasMore && !loadingMore && !refreshing ? loadMore : undefined}
        onEndReachedThreshold={0.5}
        ListHeaderComponent={
          <View>
            <Text style={styles.title}>Invoices</Text>
            {activeStore ? (
              <View style={styles.storeRow}>
                <MaterialIcons name="storefront" size={15} color={COLORS.secondaryText} />
                <Text style={styles.storeName} numberOfLines={1}>
                  {activeStore.name}
                </Text>
              </View>
            ) : null}

            <View style={styles.createButton}>
              <PrimaryButton label="Create Invoice" onPress={goToCreate} />
            </View>

            <InvoiceSearchInput value={search} onChangeText={setSearch} />

            <View style={styles.filterRow}>
              <View style={styles.filterItem}>
                <InvoiceFilterButton
                  title="Status"
                  options={STATUS_OPTIONS}
                  selectedId={statusId}
                  onChange={(id) => setStatusId(id as InvoiceStatusFilterId)}
                />
              </View>
              <View style={styles.filterItem}>
                <InvoiceFilterButton
                  title="Time"
                  options={TIME_OPTIONS}
                  selectedId={timeId}
                  onChange={setTimeId}
                />
              </View>
            </View>
          </View>
        }
        ListEmptyComponent={
          <InvoicesEmptyArea
            loading={loading}
            error={listError}
            filtered={isFiltered}
            hasStore={activeMerchantStoreId != null}
            onClearFilters={clearFilters}
            onRetry={refresh}
          />
        }
        ListFooterComponent={
          <ListLoadMoreFooter
            hasMore={hasMore}
            loadingMore={loadingMore}
            error={footerError}
            itemCount={items.length}
            label="invoices"
            onLoadMore={loadMore}
          />
        }
      />
    </SafeAreaView>
  );
}

interface InvoicesEmptyAreaProps {
  loading: boolean;
  error: string | null;
  filtered: boolean;
  hasStore: boolean;
  onClearFilters: () => void;
  onRetry: () => void;
}

/** Loading, failure, no-store, and genuinely-empty are four different answers —
 * a failure must never render as "this store has no invoices". */
function InvoicesEmptyArea({
  loading,
  error,
  filtered,
  hasStore,
  onClearFilters,
  onRetry,
}: InvoicesEmptyAreaProps) {
  if (loading) {
    return (
      <View style={styles.emptyWrap}>
        <ActivityIndicator color={COLORS.primaryText} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.emptyWrap}>
        <Text style={styles.stateTitle}>Couldn’t load invoices</Text>
        <Text style={styles.stateSubtitle}>{error}</Text>
        <Pressable
          onPress={onRetry}
          style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Retry loading invoices">
          <Text style={styles.retryLabel}>Try again</Text>
        </Pressable>
      </View>
    );
  }

  if (!hasStore) {
    return (
      <View style={styles.emptyWrap}>
        <Text style={styles.stateSubtitle}>
          Connect a store to see its invoices.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.emptyWrap}>
      <InvoiceEmptyState filtered={filtered} onClearFilters={onClearFilters} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerSpacer: {
    width: 40,
    height: 40,
  },
  pressed: {
    opacity: 0.7,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  title: {
    fontSize: 30,
    fontWeight: '700',
    color: COLORS.primaryText,
    marginTop: 8,
  },
  storeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
  },
  storeName: {
    flexShrink: 1,
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.secondaryText,
  },
  createButton: {
    marginTop: 22,
    marginBottom: 22,
  },
  filterRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
    marginBottom: 4,
  },
  filterItem: {
    flex: 1,
  },
  emptyWrap: {
    marginTop: 28,
    alignItems: 'center',
    gap: 10,
  },
  stateTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.primaryText,
    textAlign: 'center',
  },
  stateSubtitle: {
    fontSize: 15,
    lineHeight: 22,
    color: COLORS.secondaryText,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 12,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 999,
    backgroundColor: COLORS.card,
  },
  retryLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.primaryText,
  },
});
