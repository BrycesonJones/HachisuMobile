import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { DASHBOARD_COLORS } from '@/constants/dashboard-colors';
import { HachisuColors } from '@/constants/hachisu-colors';
import { useActiveStore } from '@/contexts/active-store-context';
import type { MerchantStore } from '@/types/merchant-store';

type WalletState = 'connected' | 'pending' | 'inactive';

// Map a store's raw status string to a render state. Values seen in the data
// model: 'not_connected' | 'connected' | 'error', plus 'pending_confirmation'
// (on-chain) and 'boltz_ready' / 'pending_lbtc_wallet' (Lightning/Boltz setup in
// progress). Anything unknown/null falls through to inactive.
function toWalletState(status: string | null | undefined): WalletState {
  switch (status) {
    case 'connected':
    case 'enabled':
      return 'connected';
    // On-chain shows a transient pending dot during address confirmation.
    case 'pending':
    case 'pending_confirmation':
      return 'pending';
    // Lightning/Boltz transitional states ('boltz_ready', 'pending_lbtc_wallet')
    // are intentionally NOT lit. The Lightning dot only glows once the merchant
    // has actually connected by importing their L-BTC descriptor (-> 'connected').
    // Preparing Boltz alone must never make Lightning look connected.
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
  // Which wallet row is expanded to reveal its actions (Bitcoin → Settings).
  const [expanded, setExpanded] = useState(false);

  // No active store yet — don't show misleading connected status.
  if (!activeStore) return null;

  const bitcoinState = toWalletState(activeStore.onchain_status);
  const lightningState = toWalletState(activeStore.lightning_status);
  const bitcoinConnected = bitcoinState === 'connected';

  // Wallet setup is always scoped to the selected store: the active store's id
  // and name are passed into the flow.
  function openWalletSetup(
    store: MerchantStore,
    pathname: '/account/connect-onchain-wallet' | '/account/connect-lightning',
  ) {
    router.push({
      pathname,
      params: { storeId: store.id, storeName: store.name },
    });
  }

  // Connected Bitcoin: tapping expands a small dropdown (Settings only — no
  // Send/Receive). Not connected: tapping opens the connect flow.
  function onBitcoinPress() {
    if (bitcoinConnected) {
      setExpanded((v) => !v);
    } else {
      openWalletSetup(activeStore!, '/account/connect-onchain-wallet');
    }
  }

  function openBitcoinSettings() {
    setExpanded(false);
    router.push({
      pathname: '/account/btc-wallet-settings',
      params: { storeId: activeStore!.id, storeName: activeStore!.name },
    });
  }

  return (
    <View style={styles.root}>
      <Text style={styles.label}>WALLETS</Text>
      <WalletRow name="Bitcoin" state={bitcoinState} onPress={onBitcoinPress} />
      {bitcoinConnected && expanded ? (
        <Pressable
          onPress={openBitcoinSettings}
          style={({ pressed }) => [styles.subRow, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Bitcoin wallet settings">
          <Text style={styles.subRowLabel}>Settings</Text>
        </Pressable>
      ) : null}
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
  // Indented dropdown action under the connected Bitcoin row.
  subRow: {
    height: 28,
    justifyContent: 'center',
    paddingLeft: 19, // dot width (9) + row gap (10) → aligns with row labels
  },
  subRowLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: HachisuColors.primary,
  },
});
