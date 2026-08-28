import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { DASHBOARD_COLORS } from '@/constants/dashboard-colors';
import { LIGHTNING_BETA_LABEL, LIGHTNING_ENABLED } from '@/constants/feature-flags';
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

// The dot glows only when a payment method is ACTIVE — configured AND enabled.
// A configured-but-disabled method (connection exists, but the merchant can't
// currently accept payments) shows the muted/inactive dot, even though the
// settings screen still treats it as connected/configured.
function walletDotState(status: string | null | undefined, enabled: boolean): WalletState {
  if (status === 'connected') return enabled ? 'connected' : 'inactive';
  return toWalletState(status);
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
  // Which wallet row (if any) is expanded to reveal its actions (→ Settings).
  const [expanded, setExpanded] = useState<'bitcoin' | 'lightning' | null>(null);

  // No active store yet — don't show misleading connected status.
  if (!activeStore) return null;

  // "configured" = a connection exists (tapping opens the Settings dropdown even
  // when disabled). "state" = the dot, which only glows when configured AND enabled.
  const bitcoinConfigured = activeStore.onchain_status === 'connected';
  const lightningConfigured = activeStore.lightning_status === 'connected';
  const bitcoinState = walletDotState(activeStore.onchain_status, activeStore.onchain_enabled);
  const lightningState = walletDotState(activeStore.lightning_status, activeStore.lightning_enabled);

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

  // Connected wallet: tapping expands a small dropdown (Settings only — no
  // Send/Receive/node info). Not connected: tapping opens the connect flow.
  function onBitcoinPress() {
    if (bitcoinConfigured) {
      setExpanded((v) => (v === 'bitcoin' ? null : 'bitcoin'));
    } else {
      openWalletSetup(activeStore!, '/account/connect-onchain-wallet');
    }
  }

  function onLightningPress() {
    if (lightningConfigured) {
      setExpanded((v) => (v === 'lightning' ? null : 'lightning'));
    } else {
      openWalletSetup(activeStore!, '/account/connect-lightning');
    }
  }

  function openBitcoinSettings() {
    setExpanded(null);
    router.push({
      pathname: '/account/btc-wallet-settings',
      params: { storeId: activeStore!.id, storeName: activeStore!.name },
    });
  }

  function openLightningSettings() {
    setExpanded(null);
    router.push({
      pathname: '/account/lightning-settings',
      params: { storeId: activeStore!.id, storeName: activeStore!.name },
    });
  }

  return (
    <View style={styles.root}>
      <Text style={styles.label}>WALLETS</Text>
      <WalletRow name="Bitcoin" state={bitcoinState} onPress={onBitcoinPress} />
      {bitcoinConfigured && expanded === 'bitcoin' ? (
        <Pressable
          onPress={openBitcoinSettings}
          style={({ pressed }) => [styles.subRow, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Bitcoin wallet settings">
          <Text style={styles.subRowLabel}>Settings</Text>
        </Pressable>
      ) : null}
      {LIGHTNING_ENABLED ? (
        <>
          <WalletRow name="Lightning" state={lightningState} onPress={onLightningPress} />
          {lightningConfigured && expanded === 'lightning' ? (
            <Pressable
              onPress={openLightningSettings}
              style={({ pressed }) => [styles.subRow, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel="Lightning settings">
              <Text style={styles.subRowLabel}>Settings</Text>
            </Pressable>
          ) : null}
        </>
      ) : (
        // Gated: Lightning stays visible so merchants know it's planned, but the
        // row is inert — muted, not tappable, and it never opens setup/settings
        // regardless of the store's underlying lightning_status.
        <View
          style={styles.row}
          accessible
          accessibilityLabel={`${LIGHTNING_BETA_LABEL}. Coming soon.`}
          accessibilityState={{ disabled: true }}>
          <View style={[styles.dot, { backgroundColor: STATE_COLOR.inactive }]} />
          <Text style={[styles.rowLabel, styles.rowLabelMuted]}>{LIGHTNING_BETA_LABEL}</Text>
          <Text style={styles.comingSoon}>Coming soon</Text>
        </View>
      )}
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
  rowLabelMuted: {
    color: DASHBOARD_COLORS.secondaryText,
  },
  comingSoon: {
    fontSize: 12,
    color: DASHBOARD_COLORS.secondaryText,
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
