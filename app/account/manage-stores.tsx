import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AccountProfileHub } from '@/components/account/account-profile-hub';
import { COLORS } from '@/constants/colors';
import { useMerchantStores } from '@/hooks/use-merchant-stores';
import { merchantStoreStatusLabel, type MerchantStore } from '@/types/merchant-store';

export default function ManageStoresScreen() {
  const router = useRouter();
  const { stores, loading, error, refetch } = useMerchantStores();

  // Refetch whenever the screen regains focus (e.g. returning from Create Store).
  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch]),
  );

  const defaultStore = stores.find((s) => s.is_default) ?? null;
  const otherStores = stores.filter((s) => !s.is_default);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="light-content" />

      <View style={styles.headerRow}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={10}>
          <MaterialIcons name="chevron-left" size={24} color={COLORS.primaryText} />
          <Text style={styles.backLabel}>Back</Text>
        </Pressable>
        <AccountProfileHub />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.title}>Manage Stores</Text>

        {loading && stores.length === 0 ? (
          <ActivityIndicator color={COLORS.primary} style={styles.loader} />
        ) : null}

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        {!loading && stores.length === 0 && !error ? (
          <Text style={styles.emptyText}>No stores yet. Create your first store below.</Text>
        ) : null}

        {defaultStore ? (
          <>
            <Text style={styles.sectionLabel}>Default</Text>
            <StoreRow store={defaultStore} onPress={() => {}} />
          </>
        ) : null}

        {otherStores.length > 0 ? (
          <>
            <Text style={styles.sectionLabel}>Other Stores</Text>
            {otherStores.map((store) => (
              <StoreRow key={store.id} store={store} onPress={() => {}} />
            ))}
          </>
        ) : null}

        <Pressable
          onPress={() => router.push('/account/create-store')}
          style={({ pressed }) => [styles.createButton, pressed && styles.createButtonPressed]}
          accessibilityRole="button"
          accessibilityLabel="Create Store">
          <MaterialIcons name="add" size={20} color={COLORS.background} />
          <Text style={styles.createButtonText}>Create Store</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function StoreRow({ store, onPress }: { store: MerchantStore; onPress: () => void }) {
  // TODO: open a store detail screen once it exists.
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      accessibilityRole="button"
      accessibilityLabel={`${store.name}, ${store.default_currency}, ${merchantStoreStatusLabel(store)}`}>
      <View style={styles.rowMain}>
        <View style={styles.rowTitleLine}>
          <Text style={styles.rowName} numberOfLines={1}>
            {store.name}
          </Text>
          {store.is_default ? (
            <View style={styles.defaultBadge}>
              <Text style={styles.defaultBadgeText}>Default</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.rowMeta}>{store.default_currency}</Text>
        <Text style={styles.rowStatus}>{merchantStoreStatusLabel(store)}</Text>
      </View>
      <MaterialIcons name="chevron-right" size={22} color={COLORS.mutedText} />
    </Pressable>
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
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 8,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 40,
    paddingRight: 14,
    paddingLeft: 4,
  },
  backLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: COLORS.primaryText,
    marginLeft: 2,
  },
  pressed: {
    opacity: 0.6,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  title: {
    fontSize: 28,
    fontWeight: '600',
    color: COLORS.primaryText,
    marginBottom: 16,
  },
  loader: {
    marginTop: 24,
  },
  errorText: {
    marginTop: 16,
    fontSize: 13,
    color: '#F87171',
  },
  emptyText: {
    marginTop: 16,
    fontSize: 15,
    color: COLORS.secondaryText,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.secondaryText,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginTop: 22,
    marginBottom: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.cardBorder,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  rowPressed: {
    opacity: 0.7,
  },
  rowMain: {
    flex: 1,
  },
  rowTitleLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rowName: {
    flexShrink: 1,
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.primaryText,
  },
  defaultBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: COLORS.primary,
  },
  defaultBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.background,
    letterSpacing: 0.3,
  },
  rowMeta: {
    marginTop: 4,
    fontSize: 13,
    color: COLORS.secondaryText,
  },
  rowStatus: {
    marginTop: 2,
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.primary,
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 28,
    height: 52,
    borderRadius: 12,
    backgroundColor: COLORS.primary,
  },
  createButtonPressed: {
    opacity: 0.85,
  },
  createButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.background,
  },
});
