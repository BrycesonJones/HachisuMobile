import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  Alert,
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

import { CurrencySelect } from '@/components/account/currency-select';
import { PrimaryButton } from '@/components/auth/primary-button';
import { InvoiceFormField } from '@/components/payments/invoices/create/invoice-form-field';
import { isValidAmount } from '@/components/payments/invoices/create/validation';
import {
  generateProductIdFromTitle,
  isValidProductId,
} from '@/components/payments/pos/products/product-id';
import { PriceTypeSelector } from '@/components/payments/pos/products/price-type-selector';
import {
  priceTypeNeedsAmount,
  type PosProduct,
  type ProductPriceType,
} from '@/components/payments/pos/products/product-types';
import { ToggleRow } from '@/components/payments/requests/toggle-row';
import { CountedTextArea } from '@/components/payments/shared/counted-text-area';
import { COLORS } from '@/constants/colors';
import { DEFAULT_CURRENCY } from '@/constants/currencies';
import { useActiveStore } from '@/contexts/active-store-context';

const DESCRIPTION_LIMIT = 300;

const PRICE_TYPE_HELP: Record<ProductPriceType, string> = {
  fixed: 'Customers pay the exact price.',
  free: 'The product is free.',
  any: 'Customers choose any amount.',
  minimum: 'Customers must pay at least this amount.',
};

interface ProductFormProps {
  title: string;
  initialProduct?: PosProduct;
  onSubmit: (product: PosProduct) => void;
  onDelete?: () => void;
  /** When provided (e.g. presented in a modal), the header dismisses via this
   * instead of router.back(). */
  onClose?: () => void;
}

export function ProductForm({
  title,
  initialProduct,
  onSubmit,
  onDelete,
  onClose,
}: ProductFormProps) {
  const router = useRouter();
  const { activeStore } = useActiveStore();

  const dismiss = onClose ?? (() => router.back());

  const [name, setName] = useState(initialProduct?.name ?? '');
  const [productId, setProductId] = useState(initialProduct?.productId ?? '');
  // An existing product's id counts as user-owned, so editing the name won't
  // clobber it. New products auto-mirror the name until the id is hand-edited.
  const [productIdDirty, setProductIdDirty] = useState(Boolean(initialProduct));
  const [priceType, setPriceType] = useState<ProductPriceType>(
    initialProduct?.priceType ?? 'fixed',
  );
  const [price, setPrice] = useState(initialProduct?.price ?? '');
  const [currency, setCurrency] = useState(
    initialProduct?.currency ?? activeStore?.default_currency ?? DEFAULT_CURRENCY,
  );
  const [enabled, setEnabled] = useState(initialProduct?.enabled ?? true);
  const [description, setDescription] = useState(initialProduct?.description ?? '');
  const [category, setCategory] = useState(initialProduct?.category ?? '');
  const [inventory, setInventory] = useState(initialProduct?.inventory ?? '');

  function handleNameChange(text: string) {
    setName(text);
    if (!productIdDirty) setProductId(generateProductIdFromTitle(text));
  }

  function handleProductIdChange(text: string) {
    setProductId(text);
    // Clearing the field re-enables auto-generation from the name.
    setProductIdDirty(text.trim().length > 0);
  }

  const priceShown = priceTypeNeedsAmount(priceType);

  const productIdError =
    productId.trim().length > 0 && !isValidProductId(productId.trim())
      ? 'Use lowercase letters, numbers, and hyphens only.'
      : null;
  const priceError =
    priceShown && price.length > 0 && !isValidAmount(price)
      ? 'Enter an amount greater than 0.'
      : null;
  const inventoryValid = inventory.trim() === '' || /^\d+$/.test(inventory.trim());
  const inventoryError =
    inventory.trim() !== '' && !inventoryValid
      ? 'Enter a whole number (0 or more).'
      : null;

  const canSave =
    name.trim().length > 0 &&
    isValidProductId(productId.trim()) &&
    (!priceShown || isValidAmount(price)) &&
    currency.length > 0 &&
    inventoryValid;

  function handleSave() {
    if (!canSave) return;
    onSubmit({
      productId: productId.trim(),
      name: name.trim(),
      priceType,
      price: priceShown ? price.trim() : '',
      currency,
      enabled,
      description,
      category: category.trim(),
      inventory: inventory.trim(),
    });
  }

  function confirmDelete() {
    if (!onDelete) return;
    Alert.alert(
      'Delete product?',
      'This product will be removed from the local POS product list.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: onDelete },
      ],
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="light-content" />

      <View style={styles.headerRow}>
        <Pressable
          onPress={dismiss}
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
          <Text style={styles.title}>{title}</Text>
          {activeStore ? (
            <View style={styles.storeRow}>
              <MaterialIcons name="storefront" size={15} color={COLORS.secondaryText} />
              <Text style={styles.storeName} numberOfLines={1}>
                {activeStore.name}
              </Text>
            </View>
          ) : null}

          <InvoiceFormField
            label="Product Name"
            required
            value={name}
            onChangeText={handleNameChange}
            placeholder="Example: Green Tea"
            returnKeyType="next"
          />

          <InvoiceFormField
            label="Product ID"
            required
            value={productId}
            onChangeText={handleProductIdChange}
            placeholder="green-tea"
            autoCapitalize="none"
            autoCorrect={false}
            error={productIdError}
          />
          <Text style={styles.helperText}>
            Generated from the product name. You can edit it.
          </Text>

          <View style={styles.fieldBlock}>
            <Text style={styles.fieldLabel}>
              Price Type <Text style={styles.required}>*</Text>
            </Text>
            <PriceTypeSelector value={priceType} onChange={setPriceType} />
            <Text style={styles.helperText}>{PRICE_TYPE_HELP[priceType]}</Text>
          </View>

          {priceShown ? (
            <>
              <InvoiceFormField
                label="Price"
                required
                value={price}
                onChangeText={setPrice}
                placeholder="0.00"
                keyboardType="decimal-pad"
                returnKeyType="done"
                error={priceError}
                rightSlot={<Text style={styles.currencySuffix}>{currency}</Text>}
              />
              <View style={styles.fieldBlock}>
                <Text style={styles.fieldLabel}>
                  Currency <Text style={styles.required}>*</Text>
                </Text>
                <CurrencySelect value={currency} onChange={setCurrency} />
              </View>
            </>
          ) : null}

          <View style={styles.toggleBlock}>
            <ToggleRow
              label="Enabled"
              description="Disabled products won’t appear in your POS menu."
              value={enabled}
              onValueChange={setEnabled}
            />
          </View>

          {/* Details */}
          <Text style={styles.sectionLabel}>DETAILS</Text>

          <CountedTextArea
            label="Description"
            value={description}
            onChangeText={setDescription}
            placeholder="Add product details..."
            maxLength={DESCRIPTION_LIMIT}
          />

          <InvoiceFormField
            label="Category"
            value={category}
            onChangeText={setCategory}
            placeholder="Example: Drinks"
            returnKeyType="next"
          />
          <Text style={styles.helperText}>
            Categories can help organize products later.
          </Text>

          <InvoiceFormField
            label="Inventory"
            value={inventory}
            onChangeText={setInventory}
            placeholder="Leave blank for unlimited"
            keyboardType="number-pad"
            error={inventoryError}
          />
          <Text style={styles.helperText}>
            Leave blank if you do not want to track inventory.
          </Text>

          <View style={styles.saveButton}>
            <PrimaryButton label="Save Product" onPress={handleSave} disabled={!canSave} />
          </View>

          {onDelete ? (
            <Pressable
              onPress={confirmDelete}
              style={({ pressed }) => [styles.deleteButton, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel="Delete product">
              <MaterialIcons name="delete-outline" size={20} color={DESTRUCTIVE_COLOR} />
              <Text style={styles.deleteLabel}>Delete Product</Text>
            </Pressable>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
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
  currencySuffix: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.secondaryText,
  },
  toggleBlock: {
    marginTop: 18,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 1,
    color: COLORS.secondaryText,
    marginTop: 32,
    marginBottom: 4,
  },
  helperText: {
    fontSize: 13,
    color: COLORS.mutedText,
    marginTop: 8,
    lineHeight: 18,
  },
  saveButton: {
    marginTop: 32,
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
    color: DESTRUCTIVE_COLOR,
  },
});
