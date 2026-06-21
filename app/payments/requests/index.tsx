import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  Keyboard,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PrimaryButton } from '@/components/auth/primary-button';
import { InvoiceFilterButton } from '@/components/payments/invoices/invoice-filter-button';
import { RequestEmptyState } from '@/components/payments/requests/request-empty-state';
import {
  DEFAULT_STATUS_ID,
  DEFAULT_TIME_ID,
  STATUS_OPTIONS,
  TIME_OPTIONS,
} from '@/components/payments/requests/request-filters';
import { RequestSearchInput } from '@/components/payments/requests/request-search-input';
import { COLORS } from '@/constants/colors';
import { useActiveStore } from '@/contexts/active-store-context';

const CREATE_REQUEST_ROUTE = '/payments/requests/create';

// Real payment requests are not fetched yet — the list stays empty in
// production. Flip this locally if you need to eyeball a populated layout.
const DEV_SAMPLE_REQUESTS: readonly unknown[] = [];

export default function PaymentRequestsScreen() {
  const router = useRouter();
  const { activeStore } = useActiveStore();

  const [search, setSearch] = useState('');
  const [statusId, setStatusId] = useState(DEFAULT_STATUS_ID);
  const [timeId, setTimeId] = useState(DEFAULT_TIME_ID);

  const isFiltered =
    search.trim().length > 0 ||
    statusId !== DEFAULT_STATUS_ID ||
    timeId !== DEFAULT_TIME_ID;

  const visibleRequests = useMemo(() => DEV_SAMPLE_REQUESTS, []);
  const isEmpty = visibleRequests.length === 0;

  function goToCreate() {
    Keyboard.dismiss();
    router.push(CREATE_REQUEST_ROUTE as never);
  }

  function clearFilters() {
    setSearch('');
    setStatusId(DEFAULT_STATUS_ID);
    setTimeId(DEFAULT_TIME_ID);
  }

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

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Payment Requests</Text>
        {activeStore ? (
          <View style={styles.storeRow}>
            <MaterialIcons name="storefront" size={15} color={COLORS.secondaryText} />
            <Text style={styles.storeName} numberOfLines={1}>
              {activeStore.name}
            </Text>
          </View>
        ) : null}

        <View style={styles.createButton}>
          <PrimaryButton label="Create Request" onPress={goToCreate} />
        </View>

        <RequestSearchInput value={search} onChangeText={setSearch} />

        <View style={styles.filterRow}>
          <View style={styles.filterItem}>
            <InvoiceFilterButton
              title="Status"
              options={STATUS_OPTIONS}
              selectedId={statusId}
              onChange={setStatusId}
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

        {isEmpty ? (
          <View style={styles.emptyWrap}>
            <RequestEmptyState filtered={isFiltered} onClearFilters={clearFilters} />
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
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
  },
  filterItem: {
    flex: 1,
  },
  emptyWrap: {
    marginTop: 28,
  },
});
