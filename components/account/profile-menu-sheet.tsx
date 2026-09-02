import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useMemo } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HachisuColors } from '@/constants/hachisu-colors';
import type { ProfileDisplay } from '@/components/account/profile-display-utils';
import {
  buildMenuItems,
  type ProfileMenuItem,
  type ProfileMenuItemId,
} from '@/components/account/profile-menu-items';
import type { AccountType } from '@/types/user-profile';

export type { ProfileMenuItemId } from '@/components/account/profile-menu-items';

interface ProfileMenuSheetProps {
  visible: boolean;
  display: ProfileDisplay;
  accountType: AccountType | null;
  onClose: () => void;
  onSelect: (itemId: ProfileMenuItemId) => void;
  onLogout: () => void;
  /** iOS: fires after the sheet finishes dismissing. Used to defer navigation. */
  onDismiss?: () => void;
}

export function ProfileMenuSheet({
  visible,
  display,
  accountType,
  onClose,
  onSelect,
  onLogout,
  onDismiss,
}: ProfileMenuSheetProps) {
  const menuItems = useMemo(() => buildMenuItems(accountType), [accountType]);
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      onDismiss={onDismiss}
      statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}
          onPress={() => {}}
          accessibilityViewIsModal>
          <View style={styles.handleRow}>
            <View style={styles.handle} />
          </View>

          <View style={styles.headerRow}>
            <View style={styles.userBlock}>
              <Text style={styles.name} numberOfLines={1}>
                {display.displayName}
              </Text>
              {display.subtitle ? (
                <Text style={styles.subtitle} numberOfLines={1}>
                  {display.subtitle}
                </Text>
              ) : null}
              {display.accountTypeLabel ? (
                <View style={styles.accountTypeChip}>
                  <Text style={styles.accountTypeText}>{display.accountTypeLabel}</Text>
                </View>
              ) : null}
            </View>

            <Pressable
              onPress={onClose}
              style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel="Close profile menu"
              hitSlop={8}>
              <MaterialIcons name="close" size={20} color={HachisuColors.black} />
            </Pressable>
          </View>

          <View style={styles.menuSection}>
            {menuItems.map((item, index) => (
              <MenuRow
                key={item.id}
                item={item}
                showDivider={index < menuItems.length - 1}
                onPress={() => onSelect(item.id)}
              />
            ))}
          </View>

          <View style={styles.logoutSection}>
            <Pressable
              onPress={onLogout}
              style={({ pressed }) => [styles.logoutRow, pressed && styles.rowPressed]}
              accessibilityRole="button"
              accessibilityLabel="Log out">
              <MaterialIcons name="logout" size={20} color={LOGOUT_COLOR} />
              <Text style={styles.logoutText}>Log out</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

interface MenuRowProps {
  item: ProfileMenuItem;
  showDivider: boolean;
  onPress: () => void;
}

function MenuRow({ item, showDivider, onPress }: MenuRowProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        showDivider && styles.rowDivider,
        pressed && styles.rowPressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel={item.tag ? `${item.label}, ${item.tag}` : item.label}>
      <MaterialIcons name={item.icon} size={20} color={HachisuColors.black} />
      <Text style={styles.rowLabel}>{item.label}</Text>
      {item.tag ? <Text style={styles.rowTag}>{item.tag}</Text> : null}
      <MaterialIcons name="chevron-right" size={20} color={HachisuColors.gray} />
    </Pressable>
  );
}

const LOGOUT_COLOR = '#B91C1C';

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: HachisuColors.cream,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 8,
    shadowColor: HachisuColors.black,
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 16,
  },
  handleRow: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E5E7EB',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingTop: 4,
    paddingBottom: 16,
  },
  userBlock: {
    flex: 1,
    paddingRight: 12,
  },
  name: {
    fontSize: 18,
    fontWeight: '600',
    color: HachisuColors.black,
  },
  subtitle: {
    fontSize: 14,
    color: HachisuColors.gray,
    marginTop: 2,
  },
  accountTypeChip: {
    alignSelf: 'flex-start',
    marginTop: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: HachisuColors.primary,
    backgroundColor: HachisuColors.cream,
  },
  accountTypeText: {
    fontSize: 11,
    fontWeight: '600',
    color: HachisuColors.primaryDark,
    letterSpacing: 0.3,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: HachisuColors.cream,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.7,
  },
  menuSection: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E5E7EB',
    paddingVertical: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 52,
    gap: 14,
  },
  rowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F0F0F0',
  },
  rowPressed: {
    backgroundColor: '#F9FAFB',
  },
  rowLabel: {
    flex: 1,
    fontSize: 16,
    color: HachisuColors.black,
  },
  rowTag: {
    fontSize: 12,
    fontWeight: '600',
    color: HachisuColors.gray,
    letterSpacing: 0.3,
  },
  logoutSection: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E5E7EB',
  },
  logoutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 52,
    gap: 14,
  },
  logoutText: {
    fontSize: 16,
    fontWeight: '500',
    color: LOGOUT_COLOR,
  },
});
