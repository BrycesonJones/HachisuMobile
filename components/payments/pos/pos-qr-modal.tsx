import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { COLORS } from '@/constants/colors';
import { posModeLabel, type PosMode } from '@/types/pos-app';

interface PosQrModalProps {
  visible: boolean;
  /** The authoritative runtime URL from the server-side resolver — the QR
   * encodes exactly this, and Open POS opens exactly this. Nothing else is
   * ever encoded (no ids, no metadata, no credentials). */
  runtimeUrl: string | null;
  mode: PosMode;
  onOpen: () => void;
  onClose: () => void;
}

/** QR sheet for sharing the point of sale. Customers scan it and land on the
 * same BTCPay runtime that Open POS launches. */
export function PosQrModal({ visible, runtimeUrl, mode, onOpen, onClose }: PosQrModalProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <Text style={styles.title}>Point of Sale</Text>
          <Text style={styles.modeLabel}>{posModeLabel(mode)}</Text>

          {runtimeUrl ? (
            <View style={styles.qrWrap}>
              <QRCode value={runtimeUrl} size={220} backgroundColor="#f5f5f7" color="#000" />
            </View>
          ) : null}

          <Text style={styles.helper}>Scan to open this point of sale.</Text>

          <Pressable
            onPress={onOpen}
            style={({ pressed }) => [styles.openButton, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Open POS">
            <Text style={styles.openLabel}>Open POS</Text>
          </Pressable>
          <Pressable
            onPress={onClose}
            style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Close">
            <Text style={styles.closeLabel}>Close</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  sheet: {
    backgroundColor: COLORS.card,
    borderRadius: 20,
    paddingVertical: 24,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.primaryText,
  },
  modeLabel: {
    fontSize: 13,
    color: COLORS.secondaryText,
    marginTop: 4,
  },
  qrWrap: {
    marginTop: 18,
    padding: 14,
    borderRadius: 16,
    backgroundColor: '#f5f5f7',
  },
  helper: {
    fontSize: 13,
    color: COLORS.secondaryText,
    marginTop: 14,
    textAlign: 'center',
  },
  openButton: {
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    height: 48,
    borderRadius: 999,
    backgroundColor: COLORS.cream,
    marginTop: 20,
  },
  openLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.background,
  },
  closeButton: {
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    height: 44,
    marginTop: 6,
  },
  closeLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.secondaryText,
  },
  pressed: {
    opacity: 0.7,
  },
});
