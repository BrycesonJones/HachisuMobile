import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { PrimaryButton } from '@/components/auth/primary-button';
import { COLORS } from '@/constants/colors';
import { useActiveStore } from '@/contexts/active-store-context';
import {
  navigateToBitcoinWalletConnection,
  walletRequiredMessage,
  WALLET_REQUIRED_CTA,
  WALLET_REQUIRED_TITLE,
  type PaymentFeature,
} from '@/lib/payments/wallet-gate';

/**
 * The single wallet-required state shared by all four Bitcoin payment features.
 * Shown when the active store has no connected/enabled on-chain wallet, in place
 * of that feature's normal payment-management UI. Its "Connect wallet" CTA enters
 * the canonical connection flow ("Let's get started" → "Connect an existing
 * wallet") store-scoped — never the BTC Wallet Settings loading screen.
 *
 * Wallet readiness is a property of the selected store, so this behaves
 * identically for personal and business accounts.
 */
export function WalletRequiredCard({ feature }: { feature: PaymentFeature }) {
  const router = useRouter();
  const { activeStore } = useActiveStore();

  return (
    <View style={styles.card}>
      <MaterialIcons name="account-balance-wallet" size={22} color={COLORS.primaryText} />
      <Text style={styles.title}>{WALLET_REQUIRED_TITLE}</Text>
      <Text style={styles.body}>{walletRequiredMessage(feature)}</Text>
      <PrimaryButton
        label={WALLET_REQUIRED_CTA}
        onPress={() => navigateToBitcoinWalletConnection(router, activeStore)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: 18,
    padding: 18,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.secondaryText,
    gap: 10,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.primaryText,
  },
  body: {
    fontSize: 13,
    lineHeight: 19,
    color: COLORS.secondaryText,
    marginBottom: 4,
  },
});
