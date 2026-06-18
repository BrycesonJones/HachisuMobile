import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
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
import {
  connectOnchainWallet,
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
  const params = useLocalSearchParams<{
    storeId?: string;
    storeName?: string;
    extendedPublicKey?: string;
    addressType?: string;
    addresses?: string;
  }>();

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

  async function handleConfirm() {
    if (loading || !params.storeId || !params.extendedPublicKey) return;
    setLoading(true);
    setError(null);

    const result = await connectOnchainWallet({
      merchantStoreId: params.storeId,
      extendedPublicKey: params.extendedPublicKey,
      confirmedAddresses: addresses,
    });

    setLoading(false);

    if (!result.ok) {
      setError(result.error ?? 'Could not connect the wallet. Please try again.');
      return;
    }

    // Connected — return to the dashboard, which refetches on focus and shows
    // the selected store's wallet as connected.
    if (router.canDismiss()) {
      router.dismissTo('/(tabs)/home');
    } else {
      router.replace('/(tabs)/home');
    }
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
              <Text style={styles.confirmText}>Connecting…</Text>
            </View>
          ) : (
            <Text style={styles.confirmText}>Confirm</Text>
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
