import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
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
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PrimaryButton } from '@/components/auth/primary-button';
import { InvoiceFormField } from '@/components/payments/invoices/create/invoice-form-field';
import { COLORS } from '@/constants/colors';
import { useActiveStore } from '@/contexts/active-store-context';
import { createPosApp } from '@/lib/btcpay/pos-apps';

export default function CreatePosScreen() {
  const router = useRouter();
  const { activeStore, activeMerchantStoreId } = useActiveStore();

  const [appName, setAppName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const trimmedName = appName.trim();
  const canCreate = trimmedName.length > 0 && !!activeMerchantStoreId && !submitting;

  async function handleCreate() {
    if (!canCreate || !activeMerchantStoreId) return;
    setSubmitting(true);
    setErrorMessage(null);

    const { posApp, error } = await createPosApp({
      merchantStoreId: activeMerchantStoreId,
      appName: trimmedName,
    });

    if (error || !posApp) {
      setErrorMessage(error ?? 'Could not create the POS app.');
      setSubmitting(false);
      return;
    }

    // Land on the Update POS page for the new app. Replace so Back returns to
    // the POS list, not this create form.
    router.replace(`/payments/pos/${posApp.id}` as never);
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
          showsVerticalScrollIndicator={false}>
          <Text style={styles.title}>Create a new Point of Sale</Text>
          {activeStore ? (
            <View style={styles.storeRow}>
              <MaterialIcons name="storefront" size={15} color={COLORS.secondaryText} />
              <Text style={styles.storeName} numberOfLines={1}>
                {activeStore.name}
              </Text>
            </View>
          ) : null}

          <InvoiceFormField
            label="App Name"
            required
            value={appName}
            onChangeText={setAppName}
            placeholder="Example: Atlanta Pop-Up"
            returnKeyType="done"
            autoFocus
            editable={!submitting}
            onSubmitEditing={handleCreate}
          />
          <Text style={styles.helperText}>
            You can set the display title, style, currency, and products on the next
            screen.
          </Text>

          {!activeMerchantStoreId ? (
            <Text style={styles.errorText}>Select a store first to create a POS app.</Text>
          ) : null}
          {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

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
    paddingBottom: 48,
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
    marginBottom: 18,
  },
  storeName: {
    flexShrink: 1,
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.secondaryText,
  },
  helperText: {
    fontSize: 13,
    color: COLORS.mutedText,
    marginTop: 8,
    lineHeight: 18,
  },
  errorText: {
    marginTop: 16,
    fontSize: 13,
    color: '#F87171',
    lineHeight: 18,
  },
  createButton: {
    marginTop: 28,
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
});
