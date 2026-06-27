import { useFocusEffect } from '@react-navigation/native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PrimaryButton } from '@/components/auth/primary-button';
import { InvoiceFormField } from '@/components/payments/invoices/create/invoice-form-field';
import { PosAppRow } from '@/components/payments/pos/pos-app-row';
import { COLORS } from '@/constants/colors';
import { HachisuColors } from '@/constants/hachisu-colors';
import { useActiveStore } from '@/contexts/active-store-context';
import { usePosApps } from '@/hooks/use-pos-apps';
import { createPosApp } from '@/lib/btcpay/pos-apps';

export default function PointOfSaleScreen() {
  const router = useRouter();
  const { activeStore, activeMerchantStoreId } = useActiveStore();
  const { posApps, loading, error, refetch } = usePosApps(activeMerchantStoreId);

  const [appName, setAppName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Refresh when returning from the Update page so edits show.
  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch]),
  );

  const trimmedName = appName.trim();
  const canCreate = trimmedName.length > 0 && !!activeMerchantStoreId && !submitting;

  async function handleCreate() {
    if (!canCreate || !activeMerchantStoreId) return;
    setSubmitting(true);
    setCreateError(null);

    const { posApp, error: createErr } = await createPosApp({
      merchantStoreId: activeMerchantStoreId,
      appName: trimmedName,
    });

    if (createErr || !posApp) {
      setCreateError(createErr ?? 'Could not create the POS app.');
      setSubmitting(false);
      return;
    }

    setAppName('');
    setSubmitting(false);
    // Land on the Update POS page to configure the new app.
    router.push(`/payments/pos/${posApp.id}` as never);
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="light-content" />

      <View style={styles.headerRow}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={8}>
          <MaterialIcons name="chevron-left" size={24} color={COLORS.primaryText} />
        </Pressable>
        <View style={styles.headerSpacer} />
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={loading && posApps.length > 0}
              onRefresh={refetch}
              tintColor={COLORS.secondaryText}
            />
          }>
          <Text style={styles.title}>Point of Sale</Text>
          {activeStore ? (
            <View style={styles.storeRow}>
              <MaterialIcons name="storefront" size={15} color={COLORS.secondaryText} />
              <Text style={styles.storeName} numberOfLines={1}>
                {activeStore.name}
              </Text>
            </View>
          ) : null}

          {/* Create a new POS app inline. */}
          <View style={styles.createBlock}>
            <InvoiceFormField
              label="App Name"
              required
              value={appName}
              onChangeText={setAppName}
              placeholder="Example: Atlanta Pop-Up"
              returnKeyType="done"
              editable={!submitting}
              onSubmitEditing={handleCreate}
            />
            {!activeMerchantStoreId ? (
              <Text style={styles.errorText}>Select a store first to create a POS app.</Text>
            ) : null}
            {createError ? <Text style={styles.errorText}>{createError}</Text> : null}

            <View style={styles.createButton}>
              {submitting ? (
                <View style={styles.submittingButton}>
                  <ActivityIndicator color={COLORS.background} />
                  <Text style={styles.submittingLabel}>Creating…</Text>
                </View>
              ) : (
                <PrimaryButton
                  label="Create POS"
                  onPress={handleCreate}
                  disabled={!canCreate}
                />
              )}
            </View>
          </View>

          {/* Existing POS apps for this store. */}
          {loading && posApps.length === 0 ? (
            <View style={styles.centerState}>
              <ActivityIndicator color={HachisuColors.cream} />
            </View>
          ) : error ? (
            <View style={styles.centerState}>
              <Text style={styles.mutedText}>{error}</Text>
              <Pressable
                onPress={refetch}
                style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel="Try again">
                <Text style={styles.retryLabel}>Try again</Text>
              </Pressable>
            </View>
          ) : posApps.length === 0 ? (
            <Text style={styles.emptyHint}>
              Your point of sale apps will appear here.
            </Text>
          ) : (
            <View style={styles.list}>
              <Text style={styles.sectionLabel}>YOUR POS APPS</Text>
              {posApps.map((app) => (
                <PosAppRow
                  key={app.id}
                  app={app}
                  onPress={() => router.push(`/payments/pos/${app.id}` as never)}
                />
              ))}
            </View>
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerSpacer: {
    width: 40,
    height: 40,
  },
  pressed: {
    opacity: 0.7,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  title: {
    fontSize: 30,
    fontWeight: '700',
    color: COLORS.primaryText,
    marginTop: 8,
  },
  storeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
  },
  storeName: {
    flexShrink: 1,
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.secondaryText,
  },
  createBlock: {
    marginTop: 18,
  },
  errorText: {
    marginTop: 12,
    fontSize: 13,
    color: '#F87171',
    lineHeight: 18,
  },
  createButton: {
    marginTop: 18,
  },
  submittingButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    height: 52,
    borderRadius: 999,
    backgroundColor: COLORS.cream,
  },
  submittingLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.background,
  },
  centerState: {
    alignItems: 'center',
    marginTop: 40,
    gap: 16,
  },
  mutedText: {
    fontSize: 15,
    color: COLORS.secondaryText,
    textAlign: 'center',
  },
  retryButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  retryLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: HachisuColors.cream,
  },
  emptyHint: {
    marginTop: 28,
    fontSize: 14,
    color: COLORS.mutedText,
    textAlign: 'center',
  },
  list: {
    marginTop: 32,
    gap: 12,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 1,
    color: COLORS.secondaryText,
    marginBottom: 4,
  },
});
