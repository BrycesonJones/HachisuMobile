import { StyleSheet, Text, View } from 'react-native';

import { AccountProfileHub } from '@/components/account/account-profile-hub';
import { DASHBOARD_COLORS } from '@/constants/dashboard-colors';
import type { BitcoinBalance } from '@/data/bitcoin-balance';

interface BitcoinDashboardViewProps {
  balance: BitcoinBalance;
}

function formatUsd(value: number): string {
  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
  });
}

function formatBtc(value: number): string {
  return `₿${value.toFixed(8)}`;
}

export function BitcoinDashboardView({ balance }: BitcoinDashboardViewProps) {
  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <AccountProfileHub />
      </View>

      <View style={styles.balance}>
        <Text style={styles.usdValue}>{formatUsd(balance.usdValue)}</Text>
        <Text style={styles.btcAmount} numberOfLines={1} adjustsFontSizeToFit>
          {formatBtc(balance.btcAmount)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
  },
  balance: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 10,
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
});
