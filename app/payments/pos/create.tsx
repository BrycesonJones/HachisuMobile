import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
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
import { InvoiceFormField } from '@/components/payments/invoices/create/invoice-form-field';
import { generatePosAppId } from '@/components/payments/pos/app-id';
import { PosDescriptionField } from '@/components/payments/pos/pos-description-field';
import {
  PosStyleSelector,
  type PosStyle,
} from '@/components/payments/pos/pos-style-selector';
import { ProductForm } from '@/components/payments/pos/products/product-form';
import { ProductRow } from '@/components/payments/pos/products/product-row';
import type { PosProduct } from '@/components/payments/pos/products/product-types';
import { COLORS } from '@/constants/colors';
import { DEFAULT_CURRENCY } from '@/constants/currencies';
import { useActiveStore } from '@/contexts/active-store-context';

export default function CreatePosScreen() {
  const router = useRouter();
  const { activeStore } = useActiveStore();

  const [appName, setAppName] = useState('');
  const [displayTitle, setDisplayTitle] = useState('');
  const [posStyle, setPosStyle] = useState<PosStyle>('product-list');
  const [currency, setCurrency] = useState(
    activeStore?.default_currency ?? DEFAULT_CURRENCY,
  );
  const [description, setDescription] = useState('');
  // Each POS app is its own product menu — products are owned by this app's
  // local form state (a store can have multiple POS apps / menus).
  const [products, setProducts] = useState<PosProduct[]>([]);
  // Generated once on load and kept internal/local for MVP (not shown).
  const [posAppId] = useState(generatePosAppId);

  const [editorVisible, setEditorVisible] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const editingProduct = editingId
    ? products.find((p) => p.productId === editingId)
    : undefined;

  const canCreate =
    appName.trim().length > 0 &&
    displayTitle.trim().length > 0 &&
    currency.length > 0;

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
      // New product: upsert so a colliding id replaces rather than duplicating.
      const exists = prev.some((p) => p.productId === product.productId);
      return exists
        ? prev.map((p) => (p.productId === product.productId ? product : p))
        : [...prev, product];
    });
    closeEditor();
  }

  function deleteEditingProduct() {
    if (editingId) {
      setProducts((prev) => prev.filter((p) => p.productId !== editingId));
    }
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

  function handleCreate() {
    if (!canCreate) return;
    void posAppId;
    Alert.alert(
      'Point of Sale',
      'Point of Sale setup coming soon. This will create a product-based Bitcoin checkout for the active store.',
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

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <Text style={styles.title}>Create Point of Sale</Text>
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
            returnKeyType="next"
          />
          <Text style={styles.helperText}>The internal name for this point of sale.</Text>

          <InvoiceFormField
            label="Display Title"
            required
            value={displayTitle}
            onChangeText={setDisplayTitle}
            placeholder="Example: Hachisu Store"
            returnKeyType="next"
          />
          <Text style={styles.helperText}>The customer-facing title.</Text>

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

          <View style={styles.createButton}>
            <PrimaryButton label="Create POS" onPress={handleCreate} disabled={!canCreate} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal
        visible={editorVisible}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={closeEditor}>
        {/* A Modal renders in its own native hierarchy, so SafeAreaView needs a
            provider here to get real insets (otherwise the header/back button
            jam under the notch and aren't tappable). */}
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
  createButton: {
    marginTop: 32,
  },
});
