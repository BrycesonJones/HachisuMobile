import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { COLORS } from '@/constants/colors';
import { useActiveStore } from '@/contexts/active-store-context';
import { prepareBoltzLightning } from '@/lib/btcpay/lightning';

// Phase 1 Lightning entry point, scoped to the selected store.
//
// Hachisu hides BTCPay's "connect a Lightning node" choice (internal node /
// custom node / Configure Boltz) entirely. Tapping Lightning prepares Boltz in
// the background, then routes the merchant toward the L-BTC wallet setup. The
// merchant never sees node-selection or fee-explanation screens.
type Phase =
  | { kind: 'preparing' }
  | { kind: 'ready' } // Boltz ready, awaiting L-BTC descriptor import.
  | { kind: 'connected' } // Already fully connected.
  | { kind: 'error'; message: string };

export default function ConnectLightningScreen() {
  const router = useRouter();
  const { activeMerchantStoreId, refetch } = useActiveStore();
  const params = useLocalSearchParams<{ storeId?: string; storeName?: string }>();

  const storeId = params.storeId || activeMerchantStoreId || '';
  const storeName = params.storeName;

  const [phase, setPhase] = useState<Phase>({ kind: 'preparing' });

  const prepare = useCallback(async () => {
    if (!storeId) {
      setPhase({ kind: 'error', message: 'No store selected.' });
      return;
    }
    setPhase({ kind: 'preparing' });
    const result = await prepareBoltzLightning({ merchantStoreId: storeId });

    if (!result.ok) {
      setPhase({
        kind: 'error',
        message: result.error ?? 'Could not prepare Lightning. Please try again.',
      });
      return;
    }
    // Refresh the active store so the dashboard Lightning indicator reflects the
    // new (pending/connected) state.
    refetch().catch(() => {
      /* Non-fatal: indicator refreshes on next load. */
    });
    setPhase(result.status === 'connected' ? { kind: 'connected' } : { kind: 'ready' });
  }, [storeId, refetch]);

  useEffect(() => {
    void prepare();
  }, [prepare]);

  function goToWalletSetup() {
    router.push({
      pathname: '/account/import-lbtc-wallet',
      params: { storeId, storeName: storeName ?? '' },
    });
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="light-content" />

      <View style={styles.headerRow}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Close"
          hitSlop={8}>
          <MaterialIcons name="close" size={24} color={COLORS.primaryText} />
        </Pressable>
      </View>

      <View style={styles.body}>
        {phase.kind === 'preparing' && (
          <>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={styles.title}>Preparing Lightning…</Text>
            <Text style={styles.subtitle}>
              Getting {storeName ?? 'your store'} ready to receive Lightning payments.
            </Text>
          </>
        )}

        {phase.kind === 'ready' && (
          <>
            <View style={styles.iconCircle}>
              <MaterialIcons name="bolt" size={32} color={COLORS.primary} />
            </View>
            <Text style={styles.title}>Setup L-BTC Wallet</Text>
            <Text style={styles.subtitle}>
              Boltz is ready. Next, import your read-only L-BTC wallet descriptor.
            </Text>
            <Pressable
              onPress={goToWalletSetup}
              style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel="Continue to L-BTC wallet setup">
              <Text style={styles.primaryButtonText}>Continue</Text>
            </Pressable>
          </>
        )}

        {phase.kind === 'connected' && (
          <>
            <View style={styles.iconCircle}>
              <MaterialIcons name="check-circle" size={32} color={COLORS.primary} />
            </View>
            <Text style={styles.title}>Lightning is connected</Text>
            <Text style={styles.subtitle}>
              {storeName ?? 'This store'} can receive Lightning payments.
            </Text>
            <Pressable
              onPress={() => router.back()}
              style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel="Done">
              <Text style={styles.primaryButtonText}>Done</Text>
            </Pressable>
          </>
        )}

        {phase.kind === 'error' && (
          <>
            <View style={styles.iconCircle}>
              <MaterialIcons name="error-outline" size={32} color={COLORS.secondaryText} />
            </View>
            <Text style={styles.title}>Couldn&apos;t prepare Lightning</Text>
            <Text style={styles.subtitle}>{phase.message}</Text>
            <Pressable
              onPress={() => void prepare()}
              style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel="Try again">
              <Text style={styles.primaryButtonText}>Try again</Text>
            </Pressable>
          </>
        )}
      </View>
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
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
  },
  closeButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.7,
  },
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 16,
    marginTop: -48,
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: COLORS.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.cardBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.primaryText,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    color: COLORS.secondaryText,
    textAlign: 'center',
    lineHeight: 21,
  },
  primaryButton: {
    marginTop: 8,
    backgroundColor: COLORS.primary,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 32,
    minWidth: 200,
    alignItems: 'center',
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.background,
  },
});
