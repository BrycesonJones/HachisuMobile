import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { COLORS } from '@/constants/colors';
import { DASHBOARD_COLORS } from '@/constants/dashboard-colors';
import { HachisuColors } from '@/constants/hachisu-colors';
import { useActiveStore } from '@/contexts/active-store-context';

// The dashboard "Create Store" item routes straight to the existing Create
// Store configuration form — the same screen the Profile Hub → Stores flow
// reaches via its "Create Store" button. No duplicate create flow.
const CREATE_STORE_ROUTE = '/account/create-store';

/**
 * Compact store selector that scopes the dashboard to one merchant store.
 * Renders a dark pill above the balance; tapping it opens a dropdown of all
 * stores plus a "Create Store" action.
 */
export function StoreSelector() {
  const router = useRouter();
  const { stores, activeStore, activeMerchantStoreId, setActiveStoreId, loading } =
    useActiveStore();
  const [isOpen, setIsOpen] = useState(false);

  // iOS cannot push the account screen while this RN Modal is still dismissing,
  // so we defer navigation until the sheet has finished closing.
  const pendingRouteRef = useRef<string | null>(null);

  const navigatePending = useCallback(() => {
    const route = pendingRouteRef.current;
    if (!route) return;
    pendingRouteRef.current = null;
    router.push(route as never);
  }, [router]);

  const goToCreateStore = useCallback(() => {
    setIsOpen(false);
    pendingRouteRef.current = CREATE_STORE_ROUTE;
    if (Platform.OS === 'ios') {
      setTimeout(navigatePending, 400);
    } else {
      requestAnimationFrame(navigatePending);
    }
  }, [navigatePending]);

  // No stores yet: the pill becomes a direct "Create Store" call to action.
  if (!loading && stores.length === 0) {
    return (
      <View style={styles.root}>
        <Pressable
          onPress={() => router.push(CREATE_STORE_ROUTE as never)}
          style={({ pressed }) => [styles.pill, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Create Store">
          <MaterialIcons name="add" size={18} color={DASHBOARD_COLORS.primaryText} />
          <Text style={styles.pillLabel}>Create Store</Text>
        </Pressable>
      </View>
    );
  }

  const label = activeStore?.name ?? (loading ? 'Loading…' : 'Select store');

  return (
    <View style={styles.root}>
      <Pressable
        onPress={() => setIsOpen(true)}
        style={({ pressed }) => [styles.pill, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel={`Active store: ${label}. Tap to switch stores.`}
        accessibilityState={{ expanded: isOpen }}>
        <MaterialIcons
          name="storefront"
          size={16}
          color={DASHBOARD_COLORS.secondaryText}
        />
        <Text style={styles.pillLabel} numberOfLines={1}>
          {label}
        </Text>
        <MaterialIcons
          name="keyboard-arrow-down"
          size={18}
          color={DASHBOARD_COLORS.secondaryText}
        />
      </Pressable>

      <StoreDropdown
        visible={isOpen}
        stores={stores}
        activeStoreId={activeMerchantStoreId}
        onClose={() => setIsOpen(false)}
        onDismiss={navigatePending}
        onSelect={(storeId) => {
          setActiveStoreId(storeId);
          setIsOpen(false);
        }}
        onCreateStore={goToCreateStore}
      />
    </View>
  );
}

interface StoreDropdownProps {
  visible: boolean;
  stores: ReturnType<typeof useActiveStore>['stores'];
  activeStoreId: string | null;
  onClose: () => void;
  onDismiss: () => void;
  onSelect: (storeId: string) => void;
  onCreateStore: () => void;
}

function StoreDropdown({
  visible,
  stores,
  activeStoreId,
  onClose,
  onDismiss,
  onSelect,
  onCreateStore,
}: StoreDropdownProps) {
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      onDismiss={onDismiss}
      statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { marginTop: insets.top + 56 }]}
          onPress={() => {}}
          accessibilityViewIsModal>
          <ScrollView
            style={styles.list}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            bounces={false}>
            {stores.map((store) => {
              const isActive = store.id === activeStoreId;
              return (
                <Pressable
                  key={store.id}
                  onPress={() => onSelect(store.id)}
                  style={({ pressed }) => [
                    styles.row,
                    isActive && styles.rowActive,
                    pressed && styles.rowPressed,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={store.name}
                  accessibilityState={{ selected: isActive }}>
                  <MaterialIcons
                    name="storefront"
                    size={18}
                    color={isActive ? COLORS.primary : DASHBOARD_COLORS.secondaryText}
                  />
                  <Text
                    style={[styles.rowLabel, isActive && styles.rowLabelActive]}
                    numberOfLines={1}>
                    {store.name}
                  </Text>
                  {isActive ? (
                    <MaterialIcons name="check" size={18} color={COLORS.primary} />
                  ) : null}
                </Pressable>
              );
            })}

            <View style={styles.divider} />

            <Pressable
              onPress={onCreateStore}
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
              accessibilityRole="button"
              accessibilityLabel="Create Store">
              <MaterialIcons name="add" size={18} color={COLORS.cream} />
              <Text style={[styles.rowLabel, styles.createLabel]}>Create Store</Text>
            </Pressable>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    paddingHorizontal: 20,
    paddingBottom: 8,
    alignItems: 'flex-start',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    maxWidth: '80%',
    height: 38,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: COLORS.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.cardBorder,
  },
  pressed: {
    opacity: 0.7,
  },
  pillLabel: {
    flexShrink: 1,
    fontSize: 14,
    fontWeight: '500',
    color: DASHBOARD_COLORS.primaryText,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
  sheet: {
    marginHorizontal: 16,
    borderRadius: 16,
    backgroundColor: COLORS.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.cardBorder,
    overflow: 'hidden',
    shadowColor: HachisuColors.black,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 16,
  },
  list: {
    maxHeight: 360,
  },
  listContent: {
    paddingVertical: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 48,
    paddingHorizontal: 16,
  },
  rowActive: {
    backgroundColor: COLORS.cardAlt,
  },
  rowPressed: {
    backgroundColor: COLORS.cardAlt,
  },
  rowLabel: {
    flex: 1,
    fontSize: 15,
    color: DASHBOARD_COLORS.primaryText,
  },
  rowLabelActive: {
    fontWeight: '600',
    color: COLORS.primary,
  },
  createLabel: {
    fontWeight: '600',
    color: COLORS.cream,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: COLORS.cardBorder,
    marginVertical: 6,
    marginHorizontal: 16,
  },
});
