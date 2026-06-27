import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
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
import {
  PosStyleSelector,
  type PosStyle,
} from '@/components/payments/pos/pos-style-selector';
import { ProductForm } from '@/components/payments/pos/products/product-form';
import { ProductRow } from '@/components/payments/pos/products/product-row';
import type { PosProduct } from '@/components/payments/pos/products/product-types';
import { COLORS } from '@/constants/colors';
import { useActiveStore } from '@/contexts/active-store-context';
import { deletePosApp, fetchPosApp, updatePosApp } from '@/lib/btcpay/pos-apps';
import type { PosApp } from '@/types/pos-app';

function toPosStyle(value: string): PosStyle {
  return value === 'product-list-cart' ? 'product-list-cart' : 'product-list';
}

export default function UpdatePosScreen() {
  const router = useRouter();
  const { posAppId } = useLocalSearchParams<{ posAppId: string }>();
  const { activeStore } = useActiveStore();

  const [app, setApp] = useState<PosApp | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Editable config.
  const [displayTitle, setDisplayTitle] = useState('');
  const [posStyle, setPosStyle] = useState<PosStyle>('product-list');
  const [currency, setCurrency] = useState('USD');
  const [description, setDescription] = useState('');

  // Products — local menu (persistence is out of scope for now).
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
          setDisplayTitle(result.display_title);
          setPosStyle(toPosStyle(result.pos_style));
          setCurrency(result.currency);
          setDescription(result.description ?? '');
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

  const canSave = displayTitle.trim().length > 0 && currency.length > 0 && !saving;

  async function handleSave() {
    if (!app || !canSave) return;
    setSaving(true);
    setSaveError(null);
    const { error } = await updatePosApp(app.id, {
      display_title: displayTitle.trim(),
      pos_style: posStyle,
      currency,
      description: description.trim() ? description.trim() : null,
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
      'This product will be removed from the local POS product list.',
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
                POS Style <Text style={styles.required}>*</Text>
              </Text>
              <PosStyleSelector value={posStyle} onChange={setPosStyle} />
              <Text style={styles.helperText}>
                Keypad and print display options will be added later.
              </Text>
            </View>

            <View style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>
                Currency <Text style={styles.required}>*</Text>
              </Text>
              <CurrencySelect value={currency} onChange={setCurrency} />
            </View>

            <PosDescriptionField value={description} onChangeText={setDescription} />

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
