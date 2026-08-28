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
import { LightningComingSoonScreen } from '@/components/lightning/lightning-coming-soon';
import { COLORS } from '@/constants/colors';
import { LIGHTNING_ENABLED } from '@/constants/feature-flags';
import { useActiveStore } from '@/contexts/active-store-context';
import {
  getLightningSettings,
  removeLightning,
  updateLightningSettings,
  type LightningWalletStatus,
} from '@/lib/btcpay/lightning-wallet';

const ERROR_COLOR = '#F87171';

// Simplified, merchant-friendly Lightning settings for the active store.
// Intentionally NOT a BTCPay admin clone: only Enabled, Description template,
// Save, Change connection, Remove connection — no LNURL, hop hints, sats display,
// unified QR, public node info, or node internals.
// Route wrapper: while the Lightning product gate is off, this screen (and the
// get-lightning-settings call it fires on mount) is unreachable — a placeholder
// renders instead. The real screen below is untouched for re-enablement.
export default function LightningSettingsRoute() {
  if (!LIGHTNING_ENABLED) return <LightningComingSoonScreen />;
  return <LightningSettingsScreen />;
}

function LightningSettingsScreen() {
  const router = useRouter();
  const { refetch: refetchStores } = useActiveStore();
  const { storeId, storeName } = useLocalSearchParams<{
    storeId?: string;
    storeName?: string;
  }>();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [status, setStatus] = useState<LightningWalletStatus>('not_connected');
  const [enabled, setEnabled] = useState(true);
  const [descriptionTemplate, setDescriptionTemplate] = useState('');

  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!storeId) return;
    setLoading(true);
    setLoadError(null);
    const result = await getLightningSettings(storeId);
    if (!result.ok) {
      setLoadError(result.error ?? 'Could not load Lightning settings.');
      setLoading(false);
      return;
    }
    setStatus(result.status);
    setEnabled(result.enabled);
    setDescriptionTemplate(result.descriptionTemplate ?? '');
    setLoading(false);
  }, [storeId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSave() {
    if (!storeId || saving) return;
    setSaving(true);
    setSaveError(null);
    const result = await updateLightningSettings({
      merchantStoreId: storeId,
      enabled,
      descriptionTemplate,
    });
    setSaving(false);
    if (!result.ok) {
      setSaveError(result.error ?? 'Could not save settings.');
      return;
    }
    await refetchStores();
    router.back();
  }

  function confirmChangeConnection() {
    Alert.alert(
      'Change Lightning connection?',
      'This will replace the current Lightning connection for this store. If the new connection fails, your existing connection will remain active.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Change connection',
          onPress: () =>
            router.push({
              pathname: '/account/connect-lightning',
              params: { storeId, storeName: storeName ?? '', mode: 'replace' },
            }),
        },
      ],
    );
  }

  function confirmRemove() {
    Alert.alert(
      'Remove Lightning connection?',
      'This will stop this store from accepting Lightning payments until a new connection is added.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove connection', style: 'destructive', onPress: handleRemove },
      ],
    );
  }

  async function handleRemove() {
    if (!storeId || removing) return;
    setRemoving(true);
    setSaveError(null);
    const result = await removeLightning(storeId);
    setRemoving(false);
    if (!result.ok) {
      setSaveError(result.error ?? 'Could not remove the connection.');
      return;
    }
    await refetchStores();
    // After removal the merchant should be able to reconnect immediately. Route
    // into the Set L-BTC Wallet flow (connect-lightning), replacing this now-stale
    // settings screen so there's no broken state to return to.
    router.replace({
      pathname: '/account/connect-lightning',
      params: { storeId, storeName: storeName ?? '', mode: 'connect' },
    });
  }

  // A disconnected wallet must never show the editable settings form — route to
  // the Set L-BTC Wallet flow instead.
  function goSetup() {
    router.replace({
      pathname: '/account/connect-lightning',
      params: { storeId, storeName: storeName ?? '', mode: 'connect' },
    });
  }

  const busy = saving || removing;
  const notConnected = status === 'not_connected';

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
          <Text style={styles.title}>Lightning Settings</Text>
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
          ) : notConnected ? (
            <View style={styles.disconnectedBox}>
              <Text style={styles.notice}>Lightning is not connected to this store yet.</Text>
              <Pressable
                onPress={goSetup}
                style={({ pressed }) => [
                  styles.primaryButton,
                  styles.setupButton,
                  pressed && styles.pressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel="Set Up L-BTC Wallet">
                <Text style={styles.primaryButtonText}>Set Up L-BTC Wallet</Text>
              </Pressable>
            </View>
          ) : (
            <>
              {/* Enabled */}
              <View style={styles.toggleRow}>
                <View style={styles.toggleText}>
                  <Text style={styles.fieldLabel}>Enabled</Text>
                  <Text style={styles.fieldHint}>
                    When off, this store keeps the connection but won&apos;t accept Lightning
                    payments.
                  </Text>
                </View>
                <Switch
                  value={enabled}
                  onValueChange={setEnabled}
                  disabled={busy || notConnected}
                  trackColor={{ false: COLORS.cardBorder, true: COLORS.cream }}
                  thumbColor={COLORS.background}
                />
              </View>

              {/* Description template */}
              <Text style={[styles.fieldLabel, styles.labelSpacing]}>Description template</Text>
              <Text style={styles.fieldHint}>
                Shown on the Lightning invoice. Placeholders: {'{StoreName}'} {'{ItemDescription}'}{' '}
                {'{OrderId}'}
              </Text>
              <TextInput
                value={descriptionTemplate}
                onChangeText={setDescriptionTemplate}
                editable={!busy && !notConnected}
                style={styles.input}
                placeholder="Paid to {StoreName} (Order ID: {OrderId})"
                placeholderTextColor={COLORS.mutedText}
                autoCapitalize="sentences"
                autoCorrect={false}
                maxLength={500}
              />

              {saveError ? <Text style={styles.errorText}>{saveError}</Text> : null}

              {/* Save */}
              <Pressable
                onPress={handleSave}
                disabled={busy || notConnected}
                style={({ pressed }) => [
                  styles.primaryButton,
                  (busy || notConnected) && styles.buttonDisabled,
                  pressed && !busy && styles.pressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel="Save Lightning Settings">
                {saving ? (
                  <ActivityIndicator color={COLORS.background} size="small" />
                ) : (
                  <Text style={styles.primaryButtonText}>Save</Text>
                )}
              </Pressable>

              {/* Connection actions */}
              <View style={styles.divider} />

              <Pressable
                onPress={confirmChangeConnection}
                disabled={busy}
                style={({ pressed }) => [styles.secondaryButton, pressed && !busy && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel="Change connection">
                <MaterialIcons name="swap-horiz" size={20} color={COLORS.primaryText} />
                <Text style={styles.secondaryButtonText}>Change connection</Text>
              </Pressable>

              <Pressable
                onPress={confirmRemove}
                disabled={busy || notConnected}
                style={({ pressed }) => [
                  styles.destructiveButton,
                  (busy || notConnected) && styles.buttonFaded,
                  pressed && !busy && styles.pressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel="Remove connection">
                {removing ? (
                  <ActivityIndicator color={ERROR_COLOR} size="small" />
                ) : (
                  <>
                    <MaterialIcons name="delete-outline" size={20} color={ERROR_COLOR} />
                    <Text style={styles.destructiveButtonText}>Remove connection</Text>
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
  disconnectedBox: {
    marginTop: 32,
    gap: 8,
  },
  setupButton: {
    marginTop: 16,
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
  },
  input: {
    marginTop: 10,
    minHeight: 50,
    paddingHorizontal: 14,
    paddingVertical: 12,
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
  buttonFaded: {
    opacity: 0.5,
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
