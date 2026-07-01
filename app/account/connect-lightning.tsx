import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
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

import { COLORS } from '@/constants/colors';
import { useActiveStore } from '@/contexts/active-store-context';
import { prepareBoltzLightning } from '@/lib/btcpay/lightning';

// Phase 1/2 Lightning entry point, scoped to the selected store.
//
// Hachisu hides BTCPay's "connect a Lightning node" choice (internal node /
// custom node / Configure Boltz) entirely. Tapping Lightning prepares Boltz in
// the background, then shows the plain "Setup L-BTC Wallet" selection — a single
// "Import a wallet" card. We NEVER offer "Create a new wallet". The merchant
// never sees node-selection or fee-explanation screens.
type Phase =
  | { kind: 'preparing' }
  | { kind: 'ready' } // Boltz ready, awaiting L-BTC descriptor import.
  | { kind: 'blocked' } // Server-side Boltz/Lightning setup not finished yet.
  | { kind: 'error'; message: string };

export default function ConnectLightningScreen() {
  const router = useRouter();
  const { activeMerchantStoreId, refetch } = useActiveStore();
  const params = useLocalSearchParams<{ storeId?: string; storeName?: string; mode?: string }>();

  const storeId = params.storeId || activeMerchantStoreId || '';
  const storeName = params.storeName;
  // 'replace' = the merchant is changing an already-connected Lightning wallet.
  const isReplace = params.mode === 'replace';

  const [phase, setPhase] = useState<Phase>({ kind: 'preparing' });

  const prepare = useCallback(async () => {
    if (!storeId) {
      setPhase({ kind: 'error', message: 'No store selected.' });
      return;
    }
    setPhase({ kind: 'preparing' });
    const result = await prepareBoltzLightning({ merchantStoreId: storeId });

    if (!result.ok) {
      // The payment server hasn't finished Lightning (Boltz daemon) setup yet.
      // Treat as a server/admin readiness issue — never blame the merchant, and
      // don't walk them into the descriptor screen (the import would fail).
      if (result.code === 'BOLTZ_DAEMON_UNAVAILABLE') {
        setPhase({ kind: 'blocked' });
        return;
      }
      setPhase({
        kind: 'error',
        message: result.error ?? 'Could not prepare Lightning. Please try again.',
      });
      return;
    }
    // Refresh the active store so the dashboard reflects the new (pending) state.
    refetch().catch(() => {
      /* Non-fatal: indicator refreshes on next load. */
    });
    // Readiness only — always route to the Set L-BTC Wallet flow. "Connected" is
    // confirmed later by the descriptor import, never by prepare.
    setPhase({ kind: 'ready' });
  }, [storeId, refetch]);

  useEffect(() => {
    void prepare();
  }, [prepare]);

  function goToWalletImport() {
    router.push({
      pathname: '/account/import-lbtc-wallet',
      params: { storeId, storeName: storeName ?? '', mode: isReplace ? 'replace' : '' },
    });
  }

  function dismiss() {
    router.dismissTo('/(tabs)/home');
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="light-content" />

      <View style={styles.headerRow}>
        {phase.kind === 'ready' ? (
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Back"
            hitSlop={8}>
            <MaterialIcons name="arrow-back" size={24} color={COLORS.primaryText} />
          </Pressable>
        ) : (
          <View style={styles.headerButton} />
        )}
        <Pressable
          onPress={dismiss}
          style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Close"
          hitSlop={8}>
          <MaterialIcons name="close" size={24} color={COLORS.primaryText} />
        </Pressable>
      </View>

      {phase.kind === 'ready' ? (
        <ScrollView contentContainerStyle={styles.setupScroll}>
          <Text style={styles.setupTitle}>Setup L-BTC Wallet</Text>
          <Text style={styles.setupSubtitle}>
            Select the wallet to be used for receiving Lightning payments.
          </Text>

          <Pressable
            onPress={goToWalletImport}
            style={({ pressed }) => [styles.card, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Import a wallet">
            <MaterialIcons
              name="account-balance-wallet"
              size={24}
              color={COLORS.primaryText}
            />
            <View style={styles.cardText}>
              <Text style={styles.cardTitle}>Import a wallet</Text>
              <Text style={styles.cardSubtitle}>Import an existing Liquid wallet.</Text>
            </View>
            <MaterialIcons name="chevron-right" size={24} color={COLORS.secondaryText} />
          </Pressable>
        </ScrollView>
      ) : (
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

          {phase.kind === 'blocked' && (
            <>
              <View style={styles.iconCircle}>
                <MaterialIcons name="schedule" size={32} color={COLORS.secondaryText} />
              </View>
              <Text style={styles.title}>Lightning isn&apos;t ready yet</Text>
              <Text style={styles.subtitle}>
                The payment server still needs Lightning setup completed.
              </Text>
              <Pressable
                onPress={() => void prepare()}
                style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel="Try again">
                <Text style={styles.primaryButtonText}>Try Again</Text>
              </Pressable>
              <Text style={styles.helperText}>If this keeps happening, contact support.</Text>
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
      )}
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
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
  },
  headerButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.7,
  },

  // Plain "Setup L-BTC Wallet" selection (card layout).
  setupScroll: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  setupTitle: {
    marginTop: 24,
    fontSize: 28,
    fontWeight: '700',
    color: COLORS.primaryText,
    textAlign: 'center',
  },
  setupSubtitle: {
    marginTop: 8,
    marginBottom: 28,
    fontSize: 15,
    color: COLORS.secondaryText,
    textAlign: 'center',
    lineHeight: 21,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: COLORS.card,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.cardBorder,
    padding: 16,
  },
  cardText: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: COLORS.primaryText,
  },
  cardSubtitle: {
    marginTop: 2,
    fontSize: 13,
    color: COLORS.secondaryText,
  },

  // Centered states (preparing / connected / error).
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
  helperText: {
    marginTop: 4,
    fontSize: 13,
    color: COLORS.secondaryText,
    textAlign: 'center',
  },
});
