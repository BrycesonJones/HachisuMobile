import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import {
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
import { storeCountLabel } from '@/types/merchant-store';

// Phase 1.5: multi-store. The Store section reflects how many stores exist and
// the default store. Lightning / on-chain destinations ship in a later phase.
export default function StoresScreen() {
  const router = useRouter();
  const { summary, loading, error, refetch } = useMerchantStores();

  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch]),
  );

  function handleBack() {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)/home');
    }
  }

  const { defaultStore, hasAnyStore } = summary;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="light-content" />

      <View style={styles.headerRow}>
        <Pressable
          onPress={handleBack}
          style={({ pressed }) => [styles.backButton, pressed && styles.backButtonPressed]}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={10}>
          <MaterialIcons name="chevron-left" size={24} color={COLORS.primaryText} />
          <Text style={styles.backLabel}>Back</Text>
        </Pressable>
        <AccountProfileHub />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.title}>Bitcoin Payment Setup</Text>
        <Text style={styles.subtitle}>
          Choose where your customer payments should settle.
        </Text>

        {/* Stores */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <MaterialIcons name="storefront" size={20} color={COLORS.primaryText} />
            <Text style={styles.cardTitle}>Stores</Text>
          </View>

          <Text style={styles.statusLine}>
            Status:{' '}
            <Text style={[styles.statusValue, hasAnyStore && styles.statusReady]}>
              {loading && !hasAnyStore ? 'Loading…' : storeCountLabel(summary)}
            </Text>
          </Text>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          {defaultStore ? (
            <View style={styles.defaultStoreBox}>
              <Text style={styles.defaultStoreLabel}>Default Store</Text>
              <Text style={styles.defaultStoreName}>{defaultStore.name}</Text>
              <Text style={styles.defaultStoreMeta}>
                Currency: {defaultStore.default_currency}
              </Text>
            </View>
          ) : null}

          <Pressable
            onPress={() => router.push('/account/create-store')}
            style={({ pressed }) => [styles.primaryButton, pressed && styles.primaryButtonPressed]}
            accessibilityRole="button"
            accessibilityLabel="Create Store">
            <Text style={styles.primaryButtonText}>Create Store</Text>
          </Pressable>

          {hasAnyStore ? (
            <Pressable
              onPress={() => router.push('/account/manage-stores')}
              style={({ pressed }) => [styles.secondaryButton, pressed && styles.secondaryButtonPressed]}
              accessibilityRole="button"
              accessibilityLabel="Manage Stores">
              <Text style={styles.secondaryButtonText}>Manage Stores</Text>
            </Pressable>
          ) : null}
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const ERROR_COLOR = '#F87171';

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
    borderRadius: 20,
  },
  backButtonPressed: {
    opacity: 0.6,
  },
  backLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: COLORS.primaryText,
    marginLeft: 2,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  title: {
    fontSize: 28,
    fontWeight: '600',
    color: COLORS.primaryText,
  },
  subtitle: {
    marginTop: 8,
    marginBottom: 20,
    fontSize: 15,
    color: COLORS.secondaryText,
    lineHeight: 20,
  },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.cardBorder,
    padding: 16,
    marginBottom: 14,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: COLORS.primaryText,
  },
  statusLine: {
    fontSize: 14,
    color: COLORS.secondaryText,
  },
  statusValue: {
    fontWeight: '600',
    color: COLORS.secondaryText,
  },
  statusReady: {
    color: COLORS.primary,
  },
  errorText: {
    marginTop: 12,
    fontSize: 13,
    color: ERROR_COLOR,
    lineHeight: 18,
  },
  defaultStoreBox: {
    marginTop: 14,
    padding: 12,
    borderRadius: 12,
    backgroundColor: COLORS.cardAlt,
  },
  defaultStoreLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.secondaryText,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  defaultStoreName: {
    marginTop: 4,
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.primaryText,
  },
  defaultStoreMeta: {
    marginTop: 2,
    fontSize: 13,
    color: COLORS.secondaryText,
  },
  primaryButton: {
    marginTop: 16,
    height: 50,
    borderRadius: 12,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonPressed: {
    opacity: 0.85,
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.background,
  },
  secondaryButton: {
    marginTop: 10,
    height: 48,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonPressed: {
    opacity: 0.7,
  },
  secondaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.primary,
  },
});
