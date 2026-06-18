import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { DASHBOARD_COLORS } from '@/constants/dashboard-colors';
import { HachisuColors } from '@/constants/hachisu-colors';
import { useActiveStore } from '@/contexts/active-store-context';
import type { MerchantStore } from '@/types/merchant-store';

type WalletState = 'connected' | 'pending' | 'inactive';

// Map a store's raw status string to a render state. Values seen in the data
// model: 'not_connected' | 'connected' | 'error' (+ 'pending_confirmation' for
// on-chain). Anything unknown/null falls through to inactive.
function toWalletState(status: string | null | undefined): WalletState {
  switch (status) {
    case 'connected':
    case 'enabled':
      return 'connected';
    case 'pending':
    case 'pending_confirmation':
      return 'pending';
    default:
      return 'inactive';
  }
}

const STATE_COLOR: Record<WalletState, string> = {
  connected: HachisuColors.primary, // #F28C10
  pending: HachisuColors.primaryLight, // #FBBF24 — subtle/active-but-pending
  inactive: DASHBOARD_COLORS.secondaryText, // muted gray
};

/**
 * Compact, store-scoped wallet connection indicator. Shows whether the
 * currently selected store can receive Bitcoin (on-chain) and Lightning.
 * Reads from `activeStore`, so it updates immediately when stores are switched.
 */
export function WalletIndicator() {
  const router = useRouter();
  const { activeStore } = useActiveStore();

  // No active store yet — don't show misleading connected status.
  if (!activeStore) return null;

  const bitcoinState = toWalletState(activeStore.onchain_status);
  const lightningState = toWalletState(activeStore.lightning_status);

  // Wallet setup is always scoped to the selected store: the active store's id
  // and name are passed into the setup flow. Bitcoin opens the on-chain setup
  // flow ("Let's get started" → import method → xpub); Lightning opens its own
  // (currently a coming-soon) flow. Neither routes to the generic wallets page
  // or the store-detail hub.
  function openWalletSetup(
    store: MerchantStore,
    pathname: '/account/connect-onchain-wallet' | '/account/connect-lightning',
  ) {
    router.push({
      pathname,
      params: { storeId: store.id, storeName: store.name },
    });
  }

  return (
    <View style={styles.root}>
      <Text style={styles.label}>WALLETS</Text>
      <WalletRow
        name="Bitcoin"
        state={bitcoinState}
        onPress={() => openWalletSetup(activeStore, '/account/connect-onchain-wallet')}
      />
      <WalletRow
        name="Lightning"
        state={lightningState}
        onPress={() => openWalletSetup(activeStore, '/account/connect-lightning')}
      />
    </View>
  );
}

interface WalletRowProps {
  name: string;
  state: WalletState;
  onPress: () => void;
}

function WalletRow({ name, state, onPress }: WalletRowProps) {
  const connectedLabel =
    state === 'connected' ? 'connected' : state === 'pending' ? 'pending' : 'not connected';

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={`${name} wallet ${connectedLabel}. Tap to manage.`}>
      <View style={[styles.dot, { backgroundColor: STATE_COLOR[state] }]} />
      <Text style={styles.rowLabel}>{name}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    paddingHorizontal: 20,
    paddingBottom: 4,
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1,
    color: DASHBOARD_COLORS.secondaryText,
    marginBottom: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 28,
  },
  pressed: {
    opacity: 0.6,
  },
  dot: {
    width: 9,
    height: 9,
    borderRadius: 999,
  },
  rowLabel: {
    fontSize: 15,
    fontWeight: '500',
    color: DASHBOARD_COLORS.primaryText,
  },
});
