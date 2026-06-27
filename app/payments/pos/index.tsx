import { useFocusEffect } from '@react-navigation/native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PrimaryButton } from '@/components/auth/primary-button';
import { PosAppRow } from '@/components/payments/pos/pos-app-row';
import { COLORS } from '@/constants/colors';
import { HachisuColors } from '@/constants/hachisu-colors';
import { useActiveStore } from '@/contexts/active-store-context';
import { usePosApps } from '@/hooks/use-pos-apps';

export default function PointOfSaleScreen() {
  const router = useRouter();
  const { activeStore, activeMerchantStoreId } = useActiveStore();
  const { posApps, loading, error, refetch } = usePosApps(activeMerchantStoreId);

  // Refresh when returning from create/update so new or edited apps show.
  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch]),
  );

  function goToCreate() {
    router.push('/payments/pos/create' as never);
  }

  const isEmpty = !loading && !error && posApps.length === 0;

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
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={loading && posApps.length > 0}
            onRefresh={refetch}
            tintColor={COLORS.secondaryText}
          />
        }>
        <Text style={styles.title}>Point of Sale</Text>
        {activeStore ? (
          <View style={styles.storeRow}>
            <MaterialIcons name="storefront" size={15} color={COLORS.secondaryText} />
            <Text style={styles.storeName} numberOfLines={1}>
              {activeStore.name}
            </Text>
          </View>
        ) : null}

        <View style={styles.createButton}>
          <PrimaryButton label="Create POS" onPress={goToCreate} />
        </View>

        {loading && posApps.length === 0 ? (
          <View style={styles.centerState}>
            <ActivityIndicator color={HachisuColors.cream} />
          </View>
        ) : error ? (
          <View style={styles.centerState}>
            <Text style={styles.errorText}>{error}</Text>
            <Pressable
              onPress={refetch}
              style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel="Try again">
              <Text style={styles.retryLabel}>Try again</Text>
            </Pressable>
          </View>
        ) : isEmpty ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>No point of sale apps yet</Text>
            <Text style={styles.emptyBody}>
              Create a product-based checkout for in-person sales, pop-ups, events, or
              simple storefront payments.
            </Text>
          </View>
        ) : (
          <View style={styles.list}>
            {posApps.map((app) => (
              <PosAppRow
                key={app.id}
                app={app}
                onPress={() => router.push(`/payments/pos/${app.id}` as never)}
              />
            ))}
          </View>
        )}
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
  },
  list: {
    marginTop: 28,
    gap: 12,
  },
  centerState: {
    alignItems: 'center',
    marginTop: 48,
    gap: 16,
  },
  errorText: {
    fontSize: 15,
    color: COLORS.secondaryText,
    textAlign: 'center',
  },
  retryButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  retryLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: HachisuColors.cream,
  },
  emptyState: {
    alignItems: 'center',
    marginTop: 40,
    paddingHorizontal: 12,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.primaryText,
    marginBottom: 8,
    textAlign: 'center',
  },
  emptyBody: {
    fontSize: 15,
    lineHeight: 22,
    color: COLORS.secondaryText,
    textAlign: 'center',
  },
});
