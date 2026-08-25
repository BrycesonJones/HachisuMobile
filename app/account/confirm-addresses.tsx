import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
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
import { useAuth } from '@/contexts/auth-context';
import {
  connectOnchainWallet,
  newReplacementIdempotencyKey,
  replaceOnchainWallet,
  type PreviewAddress,
} from '@/lib/btcpay/onchain-wallet';

// Confirm addresses screen.
//
// The rows shown here are the ACTUAL receive addresses BTCPay (NBXplorer) derived
// from the supplied extended public key in the preview step — they are passed
// through verbatim, never regenerated on the device. The merchant checks they
// match what their own wallet produces, then taps Confirm to finalize.
export default function ConfirmAddressesScreen() {
  const router = useRouter();
  const { refetch: refetchStores } = useActiveStore();
  const { refreshProfile } = useAuth();
  const params = useLocalSearchParams<{
    storeId?: string;
    storeName?: string;
    mode?: string;
    extendedPublicKey?: string;
    addressType?: string;
    addresses?: string;
    previewVerificationId?: string;
  }>();

  const isReplace = params.mode === 'replace';

  const addresses = useMemo<PreviewAddress[]>(() => {
    try {
      const parsed = JSON.parse(params.addresses ?? '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }, [params.addresses]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedKeyPath, setCopiedKeyPath] = useState<string | null>(null);
  // Stable for this screen instance so duplicate confirm taps map to ONE
  // replacement server-side (the backend dedupes on this key).
  const [idempotencyKey] = useState(() => newReplacementIdempotencyKey());

  function handleClose() {
    // Bail out of the whole connect flow, back to the dashboard.
    if (router.canDismiss()) {
      router.dismissTo('/(tabs)/home');
    } else {
      router.replace('/(tabs)/home');
    }
  }

  async function handleCopy(item: PreviewAddress) {
    await Clipboard.setStringAsync(item.address);
    setCopiedKeyPath(item.keyPath);
    setTimeout(() => setCopiedKeyPath((k) => (k === item.keyPath ? null : k)), 1500);
  }

  function goHome() {
    if (router.canDismiss()) {
      router.dismissTo('/(tabs)/home');
    } else {
      router.replace('/(tabs)/home');
    }
  }

  async function handleConfirm() {
    if (loading || !params.storeId || !params.extendedPublicKey) return;
    if (isReplace) {
      await handleReplaceConfirm();
      return;
    }

    setLoading(true);
    setError(null);

    const result = await connectOnchainWallet({
      merchantStoreId: params.storeId,
      extendedPublicKey: params.extendedPublicKey,
      confirmedAddresses: addresses,
    });

    setLoading(false);

    if (!result.ok) {
      // The store already has a wallet (raced/stale) — connect must not overwrite.
      // Route to settings so the merchant uses the staged replacement flow.
      if (result.code === 'WALLET_ALREADY_CONNECTED') {
        router.replace({
          pathname: '/account/btc-wallet-settings',
          params: { storeId: params.storeId, storeName: params.storeName ?? '' },
        });
        return;
      }
      setError(result.error ?? 'Could not connect the wallet. Please try again.');
      return;
    }

    // Connected — return to the dashboard, which refetches on focus and shows
    // the selected store's wallet as connected.
    goHome();
  }

  async function handleReplaceConfirm() {
    if (!params.storeId || !params.extendedPublicKey) return;
    if (!params.previewVerificationId) {
      setError('Please go back and preview the replacement addresses again.');
      return;
    }
    setLoading(true);
    setError(null);

    const result = await replaceOnchainWallet({
      merchantStoreId: params.storeId,
      previewVerificationId: params.previewVerificationId,
      extendedPublicKey: params.extendedPublicKey,
      idempotencyKey,
    });

    setLoading(false);

    // Reconcile-required: BTCPay may have changed but the app couldn't confirm/
    // save cleanly. Route to the SAFE wallet-status screen — never back through
    // another replacement — so the merchant re-checks before acting.
    if (result.reconcile) {
      await refetchStores();
      await refreshProfile();
      router.replace({
        pathname: '/account/btc-wallet-settings',
        params: { storeId: params.storeId, storeName: params.storeName ?? '', reconcile: '1' },
      });
      return;
    }

    if (!result.ok) {
      setError(result.error ?? 'Could not replace the wallet. Please try again.');
      return;
    }

    // Success: refresh the store wallet-status / balance-driving state and the
    // profile summary so the dashboard glow + settings reflect the new wallet.
    await refetchStores();
    await refreshProfile();
    Alert.alert(
      'Wallet replaced',
      `${params.storeName ? `${params.storeName}'s` : 'This store’s'} Bitcoin wallet was replaced. Future payments will use the new wallet.`,
      [
        {
          text: 'Done',
          onPress: () =>
            router.replace({
              pathname: '/account/btc-wallet-settings',
              params: { storeId: params.storeId, storeName: params.storeName ?? '' },
            }),
        },
      ],
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="light-content" />

      <View style={styles.headerRow}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={10}>
          <MaterialIcons name="arrow-back" size={24} color={COLORS.primaryText} />
        </Pressable>
        <Pressable
          onPress={handleClose}
          style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Close"
          hitSlop={10}>
          <MaterialIcons name="close" size={24} color={COLORS.primaryText} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.title}>Confirm addresses</Text>
        <Text style={styles.subtitle}>
          Please check that your wallet is generating the same addresses as below.
        </Text>

        {isReplace ? (
          <View style={styles.replaceBanner}>
            <Text style={styles.replaceBannerLabel}>
              You are replacing the Bitcoin wallet for:
            </Text>
            <Text style={styles.replaceBannerStore}>{params.storeName || 'this store'}</Text>
            <Text style={styles.replaceBannerHint}>
              Your current wallet stays active until this replacement succeeds.
            </Text>
          </View>
        ) : null}

        <View style={styles.tableHeader}>
          <Text style={[styles.columnHeader, styles.keyPathColumn]}>Key path</Text>
          <Text style={[styles.columnHeader, styles.addressColumn]}>Address</Text>
        </View>

        {addresses.length === 0 ? (
          <Text style={styles.emptyText}>No addresses were returned. Go back and try again.</Text>
        ) : (
          addresses.map((item) => (
            <Pressable
              key={item.keyPath}
              onPress={() => handleCopy(item)}
              style={({ pressed }) => [styles.tableRow, pressed && styles.rowPressed]}
              accessibilityRole="button"
              accessibilityLabel={`Copy address for key path ${item.keyPath}`}>
              <Text style={[styles.keyPathText, styles.keyPathColumn]}>{item.keyPath}</Text>
              <View style={styles.addressColumn}>
                <Text style={styles.addressText} numberOfLines={1} ellipsizeMode="middle">
                  {item.address}
                </Text>
                {copiedKeyPath === item.keyPath ? (
                  <Text style={styles.copiedText}>Copied</Text>
                ) : null}
              </View>
            </Pressable>
          ))
        )}

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <Pressable
          onPress={handleConfirm}
          disabled={loading || addresses.length === 0}
          style={({ pressed }) => [
            styles.confirmButton,
            (loading || addresses.length === 0) && styles.confirmButtonDisabled,
            pressed && !loading && styles.confirmButtonPressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel="Confirm">
          {loading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color={COLORS.background} size="small" />
              <Text style={styles.confirmText}>{isReplace ? 'Replacing…' : 'Connecting…'}</Text>
            </View>
          ) : (
            <Text style={styles.confirmText}>{isReplace ? 'Replace wallet' : 'Confirm'}</Text>
          )}
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const MONOSPACE = Platform.select({ ios: 'Courier', android: 'monospace', default: 'monospace' });

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
  iconButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.6,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 48,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: COLORS.primaryText,
    textAlign: 'center',
    marginTop: 12,
  },
  subtitle: {
    marginTop: 10,
    marginBottom: 28,
    fontSize: 15,
    color: COLORS.secondaryText,
    lineHeight: 20,
    textAlign: 'center',
  },
  replaceBanner: {
    marginBottom: 24,
    padding: 14,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.cardBorder,
    backgroundColor: COLORS.cardAlt,
    alignItems: 'center',
    gap: 4,
  },
  replaceBannerLabel: {
    fontSize: 13,
    color: COLORS.secondaryText,
  },
  replaceBannerStore: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.primaryText,
    textAlign: 'center',
  },
  replaceBannerHint: {
    marginTop: 4,
    fontSize: 12,
    color: COLORS.secondaryText,
    textAlign: 'center',
    lineHeight: 17,
  },
  tableHeader: {
    flexDirection: 'row',
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.cardBorder,
  },
  columnHeader: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.secondaryText,
  },
  keyPathColumn: {
    width: 72,
    paddingRight: 12,
  },
  addressColumn: {
    flex: 1,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.cardBorder,
  },
  rowPressed: {
    opacity: 0.6,
  },
  keyPathText: {
    fontFamily: MONOSPACE,
    fontSize: 14,
    color: COLORS.secondaryText,
  },
  addressText: {
    fontFamily: MONOSPACE,
    fontSize: 13,
    color: COLORS.primaryText,
  },
  copiedText: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.primary,
  },
  emptyText: {
    marginTop: 24,
    fontSize: 15,
    color: COLORS.secondaryText,
    textAlign: 'center',
  },
  errorText: {
    marginTop: 18,
    fontSize: 13,
    color: '#F87171',
    lineHeight: 18,
    textAlign: 'center',
  },
  confirmButton: {
    alignSelf: 'center',
    marginTop: 32,
    minWidth: 160,
    height: 50,
    paddingHorizontal: 28,
    borderRadius: 12,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmButtonDisabled: {
    backgroundColor: COLORS.disabled,
  },
  confirmButtonPressed: {
    opacity: 0.85,
  },
  confirmText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.background,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
});
