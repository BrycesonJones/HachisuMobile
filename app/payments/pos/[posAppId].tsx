import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { CurrencySelect } from '@/components/account/currency-select';
import { PrimaryButton } from '@/components/auth/primary-button';
import { DeleteAppModal } from '@/components/payments/pos/delete-app-modal';
import { InvoiceFormField } from '@/components/payments/invoices/create/invoice-form-field';
import { PosDescriptionField } from '@/components/payments/pos/pos-description-field';
import { PosModeSelector } from '@/components/payments/pos/pos-mode-selector';
import { ProductForm } from '@/components/payments/pos/products/product-form';
import { ProductRow } from '@/components/payments/pos/products/product-row';
import {
  normalizePosProducts,
  type PosProduct,
} from '@/components/payments/pos/products/product-types';
import { PosQrModal } from '@/components/payments/pos/pos-qr-modal';
import { COLORS } from '@/constants/colors';
import { useActiveStore } from '@/contexts/active-store-context';
import { isShareableCheckoutUrl } from '@/lib/btcpay/checkout-url';
import {
  deletePosApp,
  fetchPosApp,
  updatePosApp,
  updatePosMode,
} from '@/lib/btcpay/pos-apps';
import { resolvePosRuntime, type PosRuntime } from '@/lib/btcpay/pos-runtime';
import { posModeFromStyle, type PosApp, type PosMode } from '@/types/pos-app';

/** One comparable value for everything the Save button persists — used to
 * disable the live-runtime actions while the editor holds unsaved changes.
 * The POS mode is deliberately NOT part of this: mode changes auto-save
 * through their own path the moment a card is tapped. */
function formSnapshot(
  displayTitle: string,
  currency: string,
  description: string,
  products: PosProduct[],
): string {
  return JSON.stringify([displayTitle, currency, description, products]);
}

export default function UpdatePosScreen() {
  const router = useRouter();
  const { posAppId } = useLocalSearchParams<{ posAppId: string }>();
  const { activeStore } = useActiveStore();

  const [app, setApp] = useState<PosApp | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Editable config. The merchant chooses a Hachisu-level mode only; the server
  // maps it to BTCPay (products -> Cart, quick-charge -> Light) and never
  // accepts a raw BTCPay view from the client.
  //
  // posMode is what the UI shows (optimistic); savedMode is what the backend
  // has confirmed. Tapping a card auto-saves immediately — it does not wait
  // for Save Point of Sale — and a failed auto-save reverts posMode to
  // savedMode so the UI never shows a mode BTCPay does not have.
  const [displayTitle, setDisplayTitle] = useState('');
  const [posMode, setPosMode] = useState<PosMode>('products');
  const [savedMode, setSavedMode] = useState<PosMode>('products');
  const [modeSaving, setModeSaving] = useState(false);
  const [modeSaved, setModeSaved] = useState(false);
  const [modeError, setModeError] = useState<string | null>(null);
  const modeSavedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [currency, setCurrency] = useState('USD');
  const [description, setDescription] = useState('');

  // Products — this app's menu, loaded from merchant_pos_apps.products and
  // saved (with the rest of the config) via update-btcpay-pos-app.
  const [products, setProducts] = useState<PosProduct[]>([]);
  const [editorVisible, setEditorVisible] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const editingProduct = editingId
    ? products.find((p) => p.productId === editingId)
    : undefined;

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [deleteVisible, setDeleteVisible] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Live-runtime actions (Open POS / Show POS QR). The URL is resolved by the
  // backend per tap; nothing here constructs or caches a BTCPay origin.
  const [savedSnapshot, setSavedSnapshot] = useState<string | null>(null);
  const [resolving, setResolving] = useState<'open' | 'qr' | null>(null);
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const [qrRuntime, setQrRuntime] = useState<PosRuntime | null>(null);
  const [qrVisible, setQrVisible] = useState(false);
  const aliveRef = useRef(true);
  useEffect(() => {
    return () => {
      aliveRef.current = false;
      if (modeSavedTimer.current) clearTimeout(modeSavedTimer.current);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!posAppId) {
        setLoadError('Missing POS app.');
        setLoading(false);
        return;
      }
      setLoading(true);
      setLoadError(null);
      try {
        const result = await fetchPosApp(posAppId);
        if (cancelled) return;
        if (!result) {
          setLoadError('This POS app is no longer available.');
        } else {
          setApp(result);
          const loadedMode = posModeFromStyle(result.pos_style);
          const loadedProducts = normalizePosProducts(result.products);
          setDisplayTitle(result.display_title);
          setPosMode(loadedMode);
          setSavedMode(loadedMode);
          setCurrency(result.currency);
          setDescription(result.description ?? '');
          setProducts(loadedProducts);
          setSavedSnapshot(
            formSnapshot(
              result.display_title,
              result.currency,
              result.description ?? '',
              loadedProducts,
            ),
          );
        }
      } catch (e) {
        if (!cancelled) {
          setLoadError(e instanceof Error ? e.message : 'Could not load the POS app.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [posAppId]);

  const canSave =
    displayTitle.trim().length > 0 && currency.length > 0 && !saving && !modeSaving;

  // Open POS / Show POS QR act on the last SAVED configuration, so they are
  // disabled while the editor holds unsaved changes — never a silent mismatch
  // between what the merchant sees here and what BTCPay renders. A mode change
  // is NOT part of this: it auto-saves the moment a card is tapped, so once
  // that save completes the actions are usable again.
  const isDirty =
    savedSnapshot !== null &&
    formSnapshot(displayTitle, currency, description, products) !== savedSnapshot;
  const runtimeDisabled = !app || isDirty || saving || modeSaving || resolving !== null;

  /**
   * Auto-saves the POS mode the moment a card is tapped: optimistic selection,
   * one request per tap (cards disable while saving, so switches can never
   * overlap), and revert-on-failure so the UI never shows a mode BTCPay does
   * not have. The server rebuilds the BTCPay payload from the LAST-SAVED row,
   * so unrelated unsaved edits in this form are never committed by this path.
   */
  async function handleModeChange(next: PosMode) {
    if (!app || modeSaving || saving) return;
    if (next === posMode) return;
    const previousSaved = savedMode;
    if (modeSavedTimer.current) clearTimeout(modeSavedTimer.current);
    setPosMode(next); // Optimistic — the card selects instantly.
    setModeSaving(true);
    setModeSaved(false);
    setModeError(null);
    try {
      const result = await updatePosMode({
        merchantStoreId: app.merchant_store_id,
        posAppId: app.id,
        posMode: next,
      });
      if (!aliveRef.current) return;
      if (result.ok) {
        setSavedMode(next);
        setModeSaved(true);
        modeSavedTimer.current = setTimeout(() => {
          if (aliveRef.current) setModeSaved(false);
        }, 2500);
      } else {
        setPosMode(previousSaved);
        setModeError(result.error || 'Unable to change POS mode. Try again.');
      }
    } catch {
      if (aliveRef.current) {
        setPosMode(previousSaved);
        setModeError('Unable to change POS mode. Try again.');
      }
    } finally {
      if (aliveRef.current) setModeSaving(false);
    }
  }

  /**
   * Resolves the authoritative runtime URL server-side, then opens it or shows
   * its QR. Responses are discarded if the screen unmounted or the response is
   * not for THIS store+app; the URL is shape-checked again before the OS ever
   * sees it (the resolver already origin-checked it against the BTCPay server).
   */
  async function handleRuntimeAction(action: 'open' | 'qr') {
    if (!app || resolving) return;
    const requestedAppId = app.id;
    const requestedStoreId = app.merchant_store_id;
    setResolving(action);
    setRuntimeError(null);
    try {
      const result = await resolvePosRuntime({
        merchantStoreId: requestedStoreId,
        posAppId: requestedAppId,
      });
      if (!aliveRef.current) return;
      if (!result.ok) {
        setRuntimeError(result.message);
        return;
      }
      const { runtime } = result;
      if (
        runtime.posAppId !== requestedAppId ||
        runtime.merchantStoreId !== requestedStoreId ||
        !isShareableCheckoutUrl(runtime.runtimeUrl)
      ) {
        setRuntimeError('Unable to open this point of sale. Try again.');
        return;
      }
      if (action === 'open') {
        await Linking.openURL(runtime.runtimeUrl);
      } else {
        setQrRuntime(runtime);
        setQrVisible(true);
      }
    } catch {
      if (aliveRef.current) setRuntimeError('Unable to open this point of sale. Try again.');
    } finally {
      if (aliveRef.current) setResolving(null);
    }
  }

  async function handleSave() {
    if (!app || !canSave) return;
    setSaving(true);
    setSaveError(null);
    const { error } = await updatePosApp(app.id, {
      displayTitle: displayTitle.trim(),
      posMode,
      currency,
      description: description.trim() ? description.trim() : null,
      products,
    });
    setSaving(false);
    if (error) {
      setSaveError(error);
      return;
    }
    router.back();
  }

  async function handleDelete() {
    if (!app || deleting) return;
    setDeleting(true);
    setDeleteError(null);
    const { error } = await deletePosApp(app.id);
    if (error) {
      setDeleteError(error);
      setDeleting(false);
      return;
    }
    setDeleting(false);
    setDeleteVisible(false);
    router.back();
  }

  function openAddProduct() {
    setEditingId(null);
    setEditorVisible(true);
  }
  function openEditProduct(product: PosProduct) {
    setEditingId(product.productId);
    setEditorVisible(true);
  }
  function closeEditor() {
    setEditorVisible(false);
    setEditingId(null);
  }
  function submitProduct(product: PosProduct) {
    setProducts((prev) => {
      if (editingId) {
        return prev.map((p) => (p.productId === editingId ? product : p));
      }
      const exists = prev.some((p) => p.productId === product.productId);
      return exists
        ? prev.map((p) => (p.productId === product.productId ? product : p))
        : [...prev, product];
    });
    closeEditor();
  }
  function deleteEditingProduct() {
    if (editingId) setProducts((prev) => prev.filter((p) => p.productId !== editingId));
    closeEditor();
  }
  function confirmDeleteProduct(product: PosProduct) {
    Alert.alert(
      'Delete product?',
      'This product will be removed from the menu when you save.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () =>
            setProducts((prev) => prev.filter((p) => p.productId !== product.productId)),
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
          style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={8}>
          <MaterialIcons name="chevron-left" size={24} color={COLORS.primaryText} />
        </Pressable>
        <View style={styles.headerSpacer} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={COLORS.cream} />
        </View>
      ) : loadError || !app ? (
        <View style={styles.center}>
          <Text style={styles.missingText}>{loadError ?? 'POS app not found.'}</Text>
        </View>
      ) : (
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}>
            <Text style={styles.title}>Update Point of Sale</Text>
            {activeStore ? (
              <View style={styles.storeRow}>
                <MaterialIcons
                  name="storefront"
                  size={15}
                  color={COLORS.secondaryText}
                />
                <Text style={styles.storeName} numberOfLines={1}>
                  {activeStore.name}
                </Text>
              </View>
            ) : null}

            <InvoiceFormField
              label="Display Title"
              required
              value={displayTitle}
              onChangeText={setDisplayTitle}
              placeholder="Example: Hachisu Store"
              returnKeyType="next"
            />

            <View style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>
                POS Mode <Text style={styles.required}>*</Text>
              </Text>
              <PosModeSelector
                value={posMode}
                onChange={handleModeChange}
                disabled={modeSaving || saving}
              />
              {modeSaving ? (
                <Text style={styles.helperText}>Saving…</Text>
              ) : modeSaved ? (
                <Text style={styles.helperText}>Saved</Text>
              ) : null}
              {modeError ? <Text style={styles.errorText}>{modeError}</Text> : null}
            </View>

            <View style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>
                Pricing Currency <Text style={styles.required}>*</Text>
              </Text>
              <CurrencySelect
                value={currency}
                onChange={setCurrency}
                label="Pricing currency"
              />
              <Text style={styles.helperText}>
                Set prices in this currency. Customers still pay in Bitcoin.
              </Text>
            </View>

            <PosDescriptionField value={description} onChangeText={setDescription} />

            {posMode === 'products' ? (
              <>
                {/* Products — this POS app's menu */}
                <Text style={styles.sectionLabel}>PRODUCTS</Text>
                {products.length === 0 ? (
                  <Text style={styles.helperText}>
                    No products yet. Add items customers can pay for in this menu.
                  </Text>
                ) : (
                  <View style={styles.productList}>
                    {products.map((product) => (
                      <ProductRow
                        key={product.productId}
                        product={product}
                        onPress={() => openEditProduct(product)}
                        onDelete={() => confirmDeleteProduct(product)}
                      />
                    ))}
                  </View>
                )}

                <Pressable
                  onPress={openAddProduct}
                  style={({ pressed }) => [styles.addProduct, pressed && styles.pressed]}
                  accessibilityRole="button"
                  accessibilityLabel="Add product">
                  <MaterialIcons name="add" size={20} color={COLORS.primaryText} />
                  <Text style={styles.addProductLabel}>Add Product</Text>
                </Pressable>
              </>
            ) : (
              <>
                {/* Quick Charge — products are hidden, NOT deleted: the catalog
                    stays in form state and is saved with the app, so switching
                    back to Products & Cart restores it untouched. BTCPay owns
                    the keypad runtime; Phase 4's Open POS / QR will resolve it. */}
                <Text style={styles.sectionLabel}>QUICK CHARGE</Text>
                <Text style={styles.helperText}>
                  Quick Charge uses a keypad for entering custom payment amounts.
                  Open POS launches the keypad.
                </Text>
              </>
            )}

            {/* Live runtime — one authoritative BTCPay URL for both modes. */}
            <View style={styles.runtimeActions}>
              <Pressable
                onPress={() => handleRuntimeAction('open')}
                disabled={runtimeDisabled}
                style={({ pressed }) => [
                  styles.runtimeButton,
                  runtimeDisabled && styles.runtimeButtonDisabled,
                  pressed && !runtimeDisabled && styles.pressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel="Open POS"
                accessibilityState={{ disabled: runtimeDisabled }}>
                {resolving === 'open' ? (
                  <ActivityIndicator size="small" color={COLORS.primaryText} />
                ) : (
                  <MaterialIcons name="open-in-new" size={20} color={COLORS.primaryText} />
                )}
                <Text style={styles.runtimeLabel}>Open POS</Text>
              </Pressable>
              <Pressable
                onPress={() => handleRuntimeAction('qr')}
                disabled={runtimeDisabled}
                style={({ pressed }) => [
                  styles.runtimeButton,
                  runtimeDisabled && styles.runtimeButtonDisabled,
                  pressed && !runtimeDisabled && styles.pressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel="Show POS QR"
                accessibilityState={{ disabled: runtimeDisabled }}>
                {resolving === 'qr' ? (
                  <ActivityIndicator size="small" color={COLORS.primaryText} />
                ) : (
                  <MaterialIcons name="qr-code-2" size={20} color={COLORS.primaryText} />
                )}
                <Text style={styles.runtimeLabel}>Show POS QR</Text>
              </Pressable>
              {isDirty ? (
                <Text style={styles.helperText}>
                  Save your changes to open this point of sale.
                </Text>
              ) : null}
              {runtimeError ? <Text style={styles.errorText}>{runtimeError}</Text> : null}
            </View>

            {saveError ? <Text style={styles.errorText}>{saveError}</Text> : null}

            <View style={styles.saveButton}>
              {saving ? (
                <View style={styles.submittingButton}>
                  <ActivityIndicator color={COLORS.background} />
                  <Text style={styles.submittingLabel}>Saving…</Text>
                </View>
              ) : (
                <PrimaryButton
                  label="Save Point of Sale"
                  onPress={handleSave}
                  disabled={!canSave}
                />
              )}
            </View>

            <Pressable
              onPress={() => {
                setDeleteError(null);
                setDeleteVisible(true);
              }}
              style={({ pressed }) => [styles.deleteButton, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel="Delete this app">
              <MaterialIcons name="delete-outline" size={20} color={DESTRUCTIVE_COLOR} />
              <Text style={styles.deleteLabel}>Delete this app</Text>
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
      )}

      <Modal
        visible={editorVisible}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={closeEditor}>
        <SafeAreaProvider>
          <ProductForm
            title={editingProduct ? 'Edit Product' : 'Add Product'}
            initialProduct={editingProduct}
            onClose={closeEditor}
            onSubmit={submitProduct}
            onDelete={editingProduct ? deleteEditingProduct : undefined}
          />
        </SafeAreaProvider>
      </Modal>

      <PosQrModal
        visible={qrVisible}
        runtimeUrl={qrRuntime?.runtimeUrl ?? null}
        mode={qrRuntime?.mode ?? posMode}
        onOpen={() => {
          if (qrRuntime && isShareableCheckoutUrl(qrRuntime.runtimeUrl)) {
            Linking.openURL(qrRuntime.runtimeUrl);
          }
        }}
        onClose={() => setQrVisible(false)}
      />

      <DeleteAppModal
        visible={deleteVisible}
        appName={app?.display_title ?? app?.app_name ?? 'this app'}
        deleting={deleting}
        error={deleteError}
        onCancel={() => {
          if (!deleting) setDeleteVisible(false);
        }}
        onConfirm={handleDelete}
      />
    </SafeAreaView>
  );
}

const DESTRUCTIVE_COLOR = '#F87171';

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
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingBottom: 64,
  },
  missingText: {
    fontSize: 15,
    color: COLORS.secondaryText,
    textAlign: 'center',
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
    marginBottom: 6,
  },
  storeName: {
    flexShrink: 1,
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.secondaryText,
  },
  fieldBlock: {
    marginTop: 18,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.primaryText,
    marginBottom: 8,
  },
  required: {
    color: COLORS.primary,
  },
  helperText: {
    fontSize: 13,
    color: COLORS.mutedText,
    marginTop: 8,
    lineHeight: 18,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 1,
    color: COLORS.secondaryText,
    marginTop: 32,
    marginBottom: 12,
  },
  productList: {
    gap: 12,
  },
  addProduct: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 14,
    height: 52,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.cardBorder,
    backgroundColor: COLORS.cardAlt,
  },
  addProductLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.primaryText,
  },
  runtimeActions: {
    marginTop: 28,
    gap: 12,
  },
  runtimeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 52,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.cardBorder,
    backgroundColor: COLORS.cardAlt,
  },
  runtimeButtonDisabled: {
    opacity: 0.4,
  },
  runtimeLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.primaryText,
  },
  errorText: {
    marginTop: 18,
    fontSize: 13,
    color: '#F87171',
    lineHeight: 18,
  },
  saveButton: {
    marginTop: 28,
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 16,
    height: 52,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(248, 113, 113, 0.5)',
    backgroundColor: 'rgba(248, 113, 113, 0.08)',
  },
  deleteLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#F87171',
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
