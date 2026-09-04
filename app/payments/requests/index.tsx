import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
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
import { InvoiceFilterButton } from '@/components/payments/invoices/invoice-filter-button';
import { RequestEmptyState } from '@/components/payments/requests/request-empty-state';
import {
  DEFAULT_TIME_ID,
  requestTimeFilterStartDate,
  TIME_OPTIONS,
} from '@/components/payments/requests/request-filters';
import { RequestRow } from '@/components/payments/requests/request-row';
import { RequestSearchInput } from '@/components/payments/requests/request-search-input';
import { WalletRequiredCard } from '@/components/payments/wallet-required-card';
import { COLORS } from '@/constants/colors';
import { useActiveStore } from '@/contexts/active-store-context';
import { useStorePaymentRequests } from '@/hooks/use-store-payment-requests';
import {
  filterPaymentRequestItems,
  type PaymentRequestListItem,
} from '@/lib/btcpay/payment-request-list';
import { isOnchainReadyForPayments } from '@/lib/payments/wallet-gate';

const CREATE_REQUEST_ROUTE = '/payments/requests/create';

/**
 * The Payment Requests screen: the payment requests this merchant created
 * through Hachisu for the active store, newest first.
 *
 * Rows come from Hachisu's own records (merchant_payment_requests, owner-read
 * RLS) — an index into BTCPay rather than a mirror of it. The list therefore
 * shows what was created and when, never live payment state: tapping a row
 * opens the detail screen, which re-reads the authoritative record from BTCPay.
 * The time window is applied server-side; the search box filters the loaded rows.
 */
export default function PaymentRequestsScreen() {
  const router = useRouter();
  const { activeStore, activeMerchantStoreId } = useActiveStore();

  // Cached, UX-only wallet readiness. A store with no connected/enabled on-chain
  // wallet shows the wallet-required state instead of the request-management UI.
  // The server independently rejects walletless payment-request creation.
  const walletReady = isOnchainReadyForPayments(activeStore);
  const walletGated = activeMerchantStoreId != null && !walletReady;

  const [search, setSearch] = useState('');
  const [timeId, setTimeId] = useState(DEFAULT_TIME_ID);

  // Recomputed only when the time filter changes, so an already-loaded list is
  // not reset on every render by a moving "now".
  const startDate = useMemo(() => requestTimeFilterStartDate(timeId), [timeId]);

  const {
    items,
    loading,
    refreshing,
    loadingMore,
    hasMore,
    error,
    refresh,
    loadMore,
  } = useStorePaymentRequests(walletGated ? null : activeMerchantStoreId, { startDate });

  // Creating a request replaces this screen's successor with the detail screen;
  // coming back here must show the new row. Skip the very first focus — the
  // hook's own initial load covers it.
  const focusedOnceRef = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (!focusedOnceRef.current) {
        focusedOnceRef.current = true;
        return;
      }
      void refresh();
    }, [refresh]),
  );

  const visibleRequests = useMemo(
    () => filterPaymentRequestItems(items, { search }),
    [items, search],
  );

  const isFiltered = search.trim().length > 0 || timeId !== DEFAULT_TIME_ID;
  const isEmpty = visibleRequests.length === 0;
  // With rows on screen, a failure belongs to the tail (a failed load-more).
  const listError = items.length === 0 ? error : null;
  const footerError = items.length === 0 ? null : error;

  const goToCreate = useCallback(() => {
    Keyboard.dismiss();
    router.push(CREATE_REQUEST_ROUTE as never);
  }, [router]);

  const clearFilters = useCallback(() => {
    setSearch('');
    setTimeId(DEFAULT_TIME_ID);
  }, []);

  const openRequest = useCallback(
    (request: PaymentRequestListItem) => {
      // Route by the durable ids bound to the store the record belongs to, so
      // the detail screen is correct even if the active store changes later.
      router.push({
        pathname: '/payments/requests/detail',
        params: {
          merchantStoreId: request.merchantStoreId,
          paymentRequestId: request.btcpayPaymentRequestId,
        },
      });
    },
    [router],
  );

  const header = (
    <View>
      <Text style={styles.title}>Payment Requests</Text>
      {activeStore ? (
        <View style={styles.storeRow}>
          <MaterialIcons name="storefront" size={15} color={COLORS.secondaryText} />
          <Text style={styles.storeName} numberOfLines={1}>
            {activeStore.name}
          </Text>
        </View>
      ) : null}
    </View>
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

      {walletGated ? (
        <View style={styles.scrollContent}>
          {header}
          <WalletRequiredCard feature="requests" />
        </View>
      ) : (
        <FlatList
          data={visibleRequests}
          keyExtractor={(request) => request.btcpayPaymentRequestId}
          renderItem={({ item }) => <RequestRow request={item} onPress={openRequest} />}
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
              {header}

              <View style={styles.createButton}>
                <PrimaryButton label="Create Request" onPress={goToCreate} />
              </View>

              <RequestSearchInput value={search} onChangeText={setSearch} />

              <View style={styles.filterRow}>
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
            isEmpty ? (
              <RequestsEmptyArea
                loading={loading}
                error={listError}
                filtered={isFiltered}
                hasStore={activeMerchantStoreId != null}
                onClearFilters={clearFilters}
                onRetry={refresh}
              />
            ) : null
          }
          ListFooterComponent={
            <ListLoadMoreFooter
              hasMore={hasMore}
              loadingMore={loadingMore}
              error={footerError}
              itemCount={items.length}
              label="payment requests"
              onLoadMore={loadMore}
            />
          }
        />
      )}
    </SafeAreaView>
  );
}

interface RequestsEmptyAreaProps {
  loading: boolean;
  error: string | null;
  filtered: boolean;
  hasStore: boolean;
  onClearFilters: () => void;
  onRetry: () => void;
}

/** Loading, failure, no-store, and genuinely-empty are four different answers —
 * a failure must never render as "this store has no payment requests". */
function RequestsEmptyArea({
  loading,
  error,
  filtered,
  hasStore,
  onClearFilters,
  onRetry,
}: RequestsEmptyAreaProps) {
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
        <Text style={styles.stateTitle}>Couldn’t load payment requests</Text>
        <Text style={styles.stateSubtitle}>{error}</Text>
        <Pressable
          onPress={onRetry}
          style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Retry loading payment requests">
          <Text style={styles.retryLabel}>Try again</Text>
        </Pressable>
      </View>
    );
  }

  if (!hasStore) {
    return (
      <View style={styles.emptyWrap}>
        <Text style={styles.stateSubtitle}>Connect a store to see its payment requests.</Text>
      </View>
    );
  }

  return (
    <View style={styles.emptyWrap}>
      <RequestEmptyState filtered={filtered} onClearFilters={onClearFilters} />
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
