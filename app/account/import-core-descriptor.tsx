import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackButton } from '@/components/auth/back-button';
import { COLORS } from '@/constants/colors';
import { useActiveStore } from '@/contexts/active-store-context';
import { connectLbtcWallet } from '@/lib/btcpay/lightning';

export default function ImportCoreDescriptorScreen() {
  const router = useRouter();
  const { activeMerchantStoreId, refetch } = useActiveStore();
  const params = useLocalSearchParams<{ storeId?: string; storeName?: string; mode?: string }>();
  const storeId = params.storeId || activeMerchantStoreId || '';

  // In replace mode use a unique wallet name so a NEW Boltz wallet is imported
  // (the backend reuses wallets by name); a first-time connect uses "Lightning".
  const [walletName, setWalletName] = useState(() =>
    params.mode === 'replace' ? `Lightning-${Date.now().toString(36)}` : 'Lightning',
  );
  const [descriptor, setDescriptor] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canImport = walletName.trim().length > 0 && descriptor.trim().length > 0 && !submitting;

  async function handleImport() {
    if (!canImport) return;
    if (!storeId) {
      setError('No store selected.');
      return;
    }
    setSubmitting(true);
    setError(null);

    const result = await connectLbtcWallet({
      merchantStoreId: storeId,
      coreDescriptor: descriptor,
      walletName,
    });

    if (!result.ok) {
      setError(result.error ?? 'Could not connect the wallet. Please try again.');
      setSubmitting(false);
      return;
    }

    // Descriptor is no longer needed on-device — drop it as soon as the import
    // succeeds so it never lingers in component state. Refresh the active store so
    // the dashboard Lightning indicator turns on, then return straight to the
    // dashboard (no interstitial success screen).
    setDescriptor('');
    refetch().catch(() => {
      /* Non-fatal: indicator refreshes on next load. */
    });
    router.dismissTo('/(tabs)/home');
  }

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
          <Text style={styles.title}>Import Readonly L-BTC Wallet</Text>

          <Text style={styles.label}>Wallet Name</Text>
          <TextInput
            value={walletName}
            onChangeText={setWalletName}
            style={styles.input}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="next"
          />

          <Text style={styles.label}>Core descriptor</Text>
          <TextInput
            value={descriptor}
            onChangeText={setDescriptor}
            editable={!submitting}
            style={styles.textArea}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="off"
            spellCheck={false}
          />

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <Pressable
            onPress={handleImport}
            disabled={!canImport}
            style={({ pressed }) => [
              styles.importButton,
              !canImport && styles.importButtonDisabled,
              pressed && canImport && styles.importButtonPressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Import">
            {submitting ? (
              <ActivityIndicator color={COLORS.background} />
            ) : (
              <Text style={styles.importText}>Import</Text>
            )}
          </Pressable>
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
    paddingBottom: 40,
  },
  title: {
    fontSize: 28,
    fontWeight: '600',
    color: COLORS.primaryText,
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.primaryText,
    marginTop: 18,
    marginBottom: 8,
  },
  input: {
    height: 52,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.cardBorder,
    backgroundColor: COLORS.cardAlt,
    color: COLORS.primaryText,
    fontSize: 16,
  },
  textArea: {
    minHeight: 96,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 12,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.cardBorder,
    backgroundColor: COLORS.cardAlt,
    color: COLORS.primaryText,
    fontSize: 16,
  },
  errorText: {
    marginTop: 16,
    fontSize: 14,
    color: '#F87171',
    lineHeight: 19,
  },
  importButton: {
    marginTop: 28,
    height: 52,
    borderRadius: 12,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  importButtonDisabled: {
    backgroundColor: COLORS.disabled,
  },
  importButtonPressed: {
    opacity: 0.85,
  },
  importText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.background,
  },
});
