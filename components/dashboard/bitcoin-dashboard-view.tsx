import { useFocusEffect } from '@react-navigation/native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import { useCallback, useRef } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { AccountProfileHub } from '@/components/account/account-profile-hub';
import { PaymentFeaturesSection } from '@/components/dashboard/payment-features-section';
import { StoreSelector } from '@/components/dashboard/store-selector';
import { WalletActionsSection } from '@/components/dashboard/wallet-actions-section';
import { WalletIndicator } from '@/components/dashboard/wallet-indicator';
import { DASHBOARD_COLORS } from '@/constants/dashboard-colors';
import { useActiveStore } from '@/contexts/active-store-context';
import { useStoreBalance, type BalanceViewState } from '@/hooks/use-store-balance';
import { formatBtcSymbol, formatFiat } from '@/lib/btcpay/balance-format';

export function BitcoinDashboardView() {
  const router = useRouter();
  const { activeStore } = useActiveStore();
  const { state, refreshing, refetch } = useStoreBalance(activeStore);

  // Revalidate the balance when the dashboard regains focus (but not on the very
  // first focus — the hook already loads on mount / store change).
  const firstFocus = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (firstFocus.current) {
        firstFocus.current = false;
        return;
      }
      refetch();
    }, [refetch]),
  );

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.push('/account/dashboard-settings')}
          style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Open settings"
          hitSlop={6}>
          <MaterialIcons
            name="settings"
            size={24}
            color={DASHBOARD_COLORS.primaryText}
          />
        </Pressable>

        <AccountProfileHub />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refetch}
            tintColor={DASHBOARD_COLORS.primaryText}
            colors={[DASHBOARD_COLORS.primaryText]}
          />
        }>
        <StoreSelector />

        <WalletIndicator />

        <BalanceBlock state={state} onRetry={refetch} />

        <PaymentFeaturesSection />

        <WalletActionsSection />
      </ScrollView>
    </View>
  );
}

interface BalanceBlockProps {
  state: BalanceViewState;
  onRetry: () => void;
}

/**
 * Renders the primary balance area. Every wallet state is visually distinct so a
 * disconnected/disabled wallet, a loading state, a fetch error, and a real zero
 * balance are never confused. A real BTC balance is never replaced by "$0.00".
 */
function BalanceBlock({ state, onRetry }: BalanceBlockProps) {
  switch (state.kind) {
    case 'no-store':
      // The create/select-store UI lives in the StoreSelector above.
      return null;

    case 'not-connected':
      return (
        <View style={styles.balance}>
          <Text style={styles.stateTitle}>No Bitcoin wallet connected</Text>
          <Text style={styles.stateSubtitle}>
            Connect a wallet in Wallets above to see this store’s balance.
          </Text>
        </View>
      );

    case 'disabled':
      return (
        <View style={styles.balance}>
          <Text style={styles.stateTitle}>Bitcoin wallet disabled</Text>
          <Text style={styles.stateSubtitle}>
            Enable the wallet in its settings to track your balance.
          </Text>
        </View>
      );

    case 'loading':
      return (
        <View style={[styles.balance, styles.balanceLoading]}>
          <ActivityIndicator color={DASHBOARD_COLORS.primaryText} />
        </View>
      );

    case 'error':
      return (
        <View style={styles.balance}>
          <Text style={styles.stateTitle}>Couldn’t load balance</Text>
          <Text style={styles.stateSubtitle}>{state.message}</Text>
          <Pressable
            onPress={onRetry}
            style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Retry loading balance">
            <Text style={styles.retryLabel}>Try again</Text>
          </Pressable>
        </View>
      );

    case 'ready': {
      const { balance } = state;
      // Primary balance is the CONFIRMED (spendable) amount.
      const fiat = formatFiat(balance.confirmedSats, balance.rate, balance.currency);
      const hasPending = balance.unconfirmedSats > 0;
      return (
        <View style={styles.balance}>
          <Text style={styles.usdValue}>{fiat ?? '—'}</Text>
          <Text style={styles.btcAmount} numberOfLines={1} adjustsFontSizeToFit>
            {formatBtcSymbol(balance.confirmedSats)}
          </Text>
          {fiat == null ? (
            <Text style={styles.pending}>Live price unavailable</Text>
          ) : null}
          {hasPending ? (
            <Text style={styles.pending}>
              {formatBtcSymbol(balance.unconfirmedSats)} pending
            </Text>
          ) : null}
        </View>
      );
    }
  }
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
  },
  iconButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.6,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 24,
  },
  balance: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingTop: 44,
    paddingBottom: 52,
    gap: 10,
  },
  // Keep the balance area a stable height while loading so nothing jumps.
  balanceLoading: {
    minHeight: 150,
  },
  usdValue: {
    fontSize: 20,
    fontWeight: '500',
    color: DASHBOARD_COLORS.secondaryText,
  },
  btcAmount: {
    fontSize: 48,
    fontWeight: '700',
    color: DASHBOARD_COLORS.primaryText,
    letterSpacing: -1,
  },
  pending: {
    fontSize: 13,
    fontWeight: '500',
    color: DASHBOARD_COLORS.mutedText,
  },
  stateTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: DASHBOARD_COLORS.primaryText,
    textAlign: 'center',
  },
  stateSubtitle: {
    fontSize: 14,
    color: DASHBOARD_COLORS.secondaryText,
    textAlign: 'center',
    paddingHorizontal: 12,
  },
  retryButton: {
    marginTop: 6,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: DASHBOARD_COLORS.iconBackground,
  },
  retryLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: DASHBOARD_COLORS.primaryText,
  },
});
