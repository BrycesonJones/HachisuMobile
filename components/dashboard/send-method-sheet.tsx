import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { COLORS } from '@/constants/colors';
import { DASHBOARD_COLORS } from '@/constants/dashboard-colors';

interface SendMethodSheetProps {
  visible: boolean;
  onClose: () => void;
  /** The single send method: on-chain via address / BIP21 / QR. */
  onSelectBitcoinWallet: () => void;
  /** iOS: fires after the sheet finishes dismissing. Used to defer navigation. */
  onDismiss?: () => void;
}

/**
 * The "Send bitcoin" bottom sheet. Deliberately a single option — Hachisu v1
 * sends only on-chain to an address/BIP21/QR destination. No usernames, no
 * contacts, no Lightning. Dark surface to match the dashboard (unlike the
 * cream profile sheet, this lives inside the wallet's dark context).
 */
export function SendMethodSheet({
  visible,
  onClose,
  onSelectBitcoinWallet,
  onDismiss,
}: SendMethodSheetProps) {
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      onDismiss={onDismiss}
      statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close">
        <Pressable
          style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) + 12 }]}
          onPress={() => {}}
          accessibilityViewIsModal>
          <View style={styles.handleRow}>
            <View style={styles.handle} />
          </View>

          <Text style={styles.title}>Send bitcoin</Text>

          <View style={styles.optionGroup}>
            <Pressable
              onPress={onSelectBitcoinWallet}
              style={({ pressed }) => [styles.optionRow, pressed && styles.rowPressed]}
              accessibilityRole="button"
              accessibilityLabel="Bitcoin wallet"
              accessibilityHint="Scan or paste a Bitcoin address, payment link, or QR code">
              <View style={styles.optionIcon}>
                <MaterialIcons
                  name="qr-code-scanner"
                  size={22}
                  color={DASHBOARD_COLORS.primaryText}
                />
              </View>
              <View style={styles.optionBody}>
                <Text style={styles.optionTitle}>Bitcoin wallet</Text>
                <Text style={styles.optionSubtitle}>Address, invoice, or QR</Text>
              </View>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: COLORS.cardAlt,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  handleRow: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
    color: DASHBOARD_COLORS.primaryText,
    textAlign: 'center',
    paddingTop: 4,
    paddingBottom: 16,
  },
  optionGroup: {
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
  },
  rowPressed: {
    opacity: 0.6,
  },
  optionIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  optionBody: {
    flex: 1,
    gap: 2,
  },
  optionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: DASHBOARD_COLORS.primaryText,
  },
  optionSubtitle: {
    fontSize: 13,
    fontWeight: '500',
    color: DASHBOARD_COLORS.secondaryText,
  },
});
