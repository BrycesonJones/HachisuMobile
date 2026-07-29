import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackButton } from '@/components/auth/back-button';
import { COLORS } from '@/constants/colors';
import { useActiveStore } from '@/contexts/active-store-context';
import {
  getOnchainWalletSettings,
  removeOnchainWallet,
  resyncOnchainWallet,
  updateOnchainWalletSettings,
  type OnchainWalletStatus,
} from '@/lib/btcpay/onchain-wallet';

const ERROR_COLOR = '#F87171';

// Simplified, merchant-friendly BTC on-chain wallet settings for the active
// store. Intentionally NOT a BTCPay admin clone: only Enabled, Label, Replace,
// Remove, and Save — no send/receive/rescan/derivation-scheme/key details.
export default function BtcWalletSettingsScreen() {
  const router = useRouter();
  const { refetch: refetchStores } = useActiveStore();
  const { storeId, storeName, reconcile } = useLocalSearchParams<{
    storeId?: string;
    storeName?: string;
    reconcile?: string;
  }>();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [status, setStatus] = useState<OnchainWalletStatus>('not_connected');
  const [enabled, setEnabled] = useState(true);
  const [label, setLabel] = useState('');

  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [resyncing, setResyncing] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  // Set when the merchant arrives here from a reconcile-required replacement.
  const [needsReconcile, setNeedsReconcile] = useState(reconcile === '1');

  const load = useCallback(async () => {
    if (!storeId) return;
    setLoading(true);
    setLoadError(null);
    const result = await getOnchainWalletSettings(storeId);
    if (!result.ok) {
      setLoadError(result.error ?? 'Could not load wallet settings.');
      setLoading(false);
      return;
    }
    setStatus(result.status);
    setEnabled(result.enabled);
    // Default the label to the wallet's label, else the store name.
    setLabel(result.label ?? storeName ?? '');
    setLoading(false);
  }, [storeId, storeName]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSave() {
    if (!storeId || saving) return;
    setSaving(true);
    setSaveError(null);
    const result = await updateOnchainWalletSettings({ merchantStoreId: storeId, enabled, label });
    setSaving(false);
    if (!result.ok) {
      setSaveError(result.error ?? 'Could not save settings.');
      return;
    }
    await refetchStores();
    router.back();
  }

  async function handleResync() {
    if (!storeId || resyncing) return;
    setResyncing(true);
    setSaveError(null);
    const result = await resyncOnchainWallet(storeId);
    setResyncing(false);
    if (!result.ok) {
      setSaveError(result.error ?? 'Could not re-check the wallet status.');
      return;
    }
    setNeedsReconcile(false);
    setStatus(result.status);
    setEnabled(result.enabled);
    setLabel(result.label ?? storeName ?? '');
    await refetchStores();
  }

  function confirmReplace() {
    Alert.alert(
      `Replace the Bitcoin wallet for ${storeName ?? 'this store'}?`,
      'Before you continue, please understand:\n\n' +
        '• Your existing funds are NOT moved. Hachisu never transfers Bitcoin between wallets.\n' +
        '• After replacement, future payments go to the NEW wallet. You must control and verify it.\n' +
        '• Your current wallet stays active until the replacement fully succeeds.\n' +
        '• Replacing does not recover funds already sent to another wallet.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Continue to Replace',
          onPress: () =>
            router.push({
              pathname: '/account/import-xpub',
              params: { storeId, storeName: storeName ?? '', mode: 'replace' },
            }),
        },
      ],
    );
  }

  function confirmRemove() {
    Alert.alert(
      'Remove Bitcoin wallet?',
      'Removing this wallet will stop this store from accepting on-chain Bitcoin payments until a new wallet is connected.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove wallet', style: 'destructive', onPress: handleRemove },
      ],
    );
  }

  async function handleRemove() {
    if (!storeId || removing) return;
    setRemoving(true);
    setSaveError(null);
    const result = await removeOnchainWallet(storeId);
    setRemoving(false);
    if (!result.ok) {
      setSaveError(result.error ?? 'Could not remove the wallet.');
      return;
    }
    await refetchStores();
    router.back();
  }

  const busy = saving || removing || resyncing;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="light-content" />

      <View style={styles.headerRow}>
        <BackButton />
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>BTC Wallet Settings</Text>
          {storeName ? <Text style={styles.subtitle}>{storeName}</Text> : null}

          {loading ? (
            <ActivityIndicator color={COLORS.cream} style={styles.loader} />
          ) : loadError ? (
            <View style={styles.loadErrorBox}>
              <Text style={styles.errorText}>{loadError}</Text>
              <Pressable
                onPress={load}
                style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel="Retry">
                <Text style={styles.retryText}>Retry</Text>
              </Pressable>
            </View>
          ) : (
            <>
              {needsReconcile ? (
                <View style={styles.reconcileBox}>
                  <Text style={styles.reconcileTitle}>Verifying wallet status</Text>
                  <Text style={styles.reconcileText}>
                    Your last replacement may have updated the wallet at BTCPay but couldn&apos;t be
                    confirmed in the app. Re-check the status below before making any further
                    changes. Do not start another replacement yet.
                  </Text>
                  <Pressable
                    onPress={handleResync}
                    disabled={busy}
                    style={({ pressed }) => [
                      styles.reconcileButton,
                      busy && styles.buttonDisabled,
                      pressed && !busy && styles.pressed,
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel="Re-check wallet status">
                    {resyncing ? (
                      <ActivityIndicator color={COLORS.background} size="small" />
                    ) : (
                      <Text style={styles.primaryButtonText}>Re-check wallet status</Text>
                    )}
                  </Pressable>
                </View>
              ) : null}

              {status === 'not_connected' ? (
                <Text style={styles.notice}>
                  No Bitcoin wallet is connected to this store yet.
                </Text>
              ) : null}

              {/* Enabled */}
              <View style={styles.toggleRow}>
                <View style={styles.toggleText}>
                  <Text style={styles.fieldLabel}>Enabled</Text>
                  <Text style={styles.fieldHint}>
                    When off, this store keeps the wallet configured but won&apos;t accept on-chain
                    Bitcoin payments.
                  </Text>
                </View>
                <Switch
                  value={enabled}
                  onValueChange={setEnabled}
                  disabled={busy || status === 'not_connected'}
                  trackColor={{ false: COLORS.cardBorder, true: COLORS.cream }}
                  thumbColor={COLORS.background}
                />
              </View>

              {/* Label */}
              <Text style={[styles.fieldLabel, styles.labelSpacing]}>Label</Text>
              <TextInput
                value={label}
                onChangeText={setLabel}
                editable={!busy && status !== 'not_connected'}
                style={styles.input}
                placeholder={storeName ?? 'Wallet label'}
                placeholderTextColor={COLORS.mutedText}
                autoCapitalize="words"
                autoCorrect={false}
                maxLength={100}
              />

              {saveError ? <Text style={styles.errorText}>{saveError}</Text> : null}

              {/* Save */}
              <Pressable
                onPress={handleSave}
                disabled={busy || status === 'not_connected'}
                style={({ pressed }) => [
                  styles.primaryButton,
                  (busy || status === 'not_connected') && styles.buttonDisabled,
                  pressed && !busy && styles.pressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel="Save Wallet Settings">
                {saving ? (
                  <ActivityIndicator color={COLORS.background} size="small" />
                ) : (
                  <Text style={styles.primaryButtonText}>Save Wallet Settings</Text>
                )}
              </Pressable>

              {/* Danger zone */}
              <View style={styles.divider} />

              <Pressable
                onPress={confirmReplace}
                disabled={busy || status === 'not_connected'}
                style={({ pressed }) => [
                  styles.secondaryButton,
                  (busy || status === 'not_connected') && styles.buttonDisabled,
                  pressed && !busy && styles.pressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel="Replace wallet">
                <MaterialIcons name="swap-horiz" size={20} color={COLORS.primaryText} />
                <Text style={styles.secondaryButtonText}>Replace wallet</Text>
              </Pressable>

              <Pressable
                onPress={confirmRemove}
                disabled={busy}
                style={({ pressed }) => [styles.destructiveButton, pressed && !busy && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel="Remove wallet">
                {removing ? (
                  <ActivityIndicator color={ERROR_COLOR} size="small" />
                ) : (
                  <>
                    <MaterialIcons name="delete-outline" size={20} color={ERROR_COLOR} />
                    <Text style={styles.destructiveButtonText}>Remove wallet</Text>
                  </>
                )}
              </Pressable>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  flex: {
    flex: 1,
  },
  headerRow: {
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 8,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 48,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: COLORS.primaryText,
  },
  subtitle: {
    marginTop: 6,
    fontSize: 15,
    color: COLORS.secondaryText,
  },
  loader: {
    marginTop: 48,
  },
  loadErrorBox: {
    marginTop: 40,
    alignItems: 'center',
    gap: 16,
  },
  notice: {
    marginTop: 20,
    fontSize: 14,
    color: COLORS.secondaryText,
  },
  reconcileBox: {
    marginTop: 24,
    padding: 16,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#F5A623',
    backgroundColor: 'rgba(245, 166, 35, 0.08)',
    gap: 12,
  },
  reconcileTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#F5A623',
  },
  reconcileText: {
    fontSize: 13,
    color: COLORS.secondaryText,
    lineHeight: 19,
  },
  reconcileButton: {
    height: 48,
    borderRadius: 12,
    backgroundColor: COLORS.cream,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    marginTop: 28,
  },
  toggleText: {
    flex: 1,
  },
  fieldLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.primaryText,
  },
  fieldHint: {
    marginTop: 4,
    fontSize: 13,
    color: COLORS.secondaryText,
    lineHeight: 18,
  },
  labelSpacing: {
    marginTop: 28,
    marginBottom: 8,
  },
  input: {
    height: 50,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.cardBorder,
    backgroundColor: COLORS.cardAlt,
    color: COLORS.primaryText,
    fontSize: 16,
  },
  errorText: {
    marginTop: 14,
    fontSize: 13,
    color: ERROR_COLOR,
    lineHeight: 18,
  },
  primaryButton: {
    marginTop: 28,
    height: 52,
    borderRadius: 12,
    backgroundColor: COLORS.cream,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: {
    backgroundColor: COLORS.disabled,
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.background,
  },
  divider: {
    marginTop: 32,
    marginBottom: 20,
    height: StyleSheet.hairlineWidth,
    backgroundColor: COLORS.cardBorder,
  },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 50,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.cardBorder,
    backgroundColor: COLORS.cardAlt,
  },
  secondaryButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.primaryText,
  },
  destructiveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 12,
    height: 50,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ERROR_COLOR,
  },
  destructiveButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: ERROR_COLOR,
  },
  retryButton: {
    paddingHorizontal: 24,
    height: 44,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.cream,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.cream,
  },
  pressed: {
    opacity: 0.7,
  },
});
