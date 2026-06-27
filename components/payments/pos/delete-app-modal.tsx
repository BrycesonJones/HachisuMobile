import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { COLORS } from '@/constants/colors';

const CONFIRM_WORD = 'DELETE';
const DESTRUCTIVE_COLOR = '#F87171';

interface DeleteAppModalProps {
  visible: boolean;
  appName: string;
  deleting: boolean;
  error?: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * BTCPay-style "Delete app" confirmation: requires typing DELETE before the
 * destructive action is enabled. Mobile-native, dark Hachisu styling.
 */
export function DeleteAppModal({
  visible,
  appName,
  deleting,
  error,
  onCancel,
  onConfirm,
}: DeleteAppModalProps) {
  const [confirmText, setConfirmText] = useState('');

  // Reset the field whenever the modal is (re)opened.
  useEffect(() => {
    if (visible) setConfirmText('');
  }, [visible]);

  const canDelete = confirmText.trim().toUpperCase() === CONFIRM_WORD && !deleting;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
      statusBarTranslucent>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.headerRow}>
            <Text style={styles.title}>Delete app</Text>
            <Pressable
              onPress={onCancel}
              disabled={deleting}
              style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel="Cancel"
              hitSlop={8}>
              <MaterialIcons name="close" size={22} color={COLORS.secondaryText} />
            </Pressable>
          </View>

          <Text style={styles.body}>
            The app <Text style={styles.bold}>{appName}</Text> and its settings will be
            permanently deleted.
          </Text>
          <Text style={styles.prompt}>
            Confirm the action by typing <Text style={styles.bold}>{CONFIRM_WORD}</Text>:
          </Text>

          <TextInput
            style={styles.input}
            value={confirmText}
            onChangeText={setConfirmText}
            placeholder={CONFIRM_WORD}
            placeholderTextColor={COLORS.mutedText}
            autoCapitalize="characters"
            autoCorrect={false}
            editable={!deleting}
            accessibilityLabel={`Type ${CONFIRM_WORD} to confirm`}
          />

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <View style={styles.actions}>
            <Pressable
              onPress={onCancel}
              disabled={deleting}
              style={({ pressed }) => [styles.cancelButton, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel="Cancel">
              <Text style={styles.cancelLabel}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={onConfirm}
              disabled={!canDelete}
              style={({ pressed }) => [
                styles.deleteButton,
                !canDelete && styles.deleteButtonDisabled,
                pressed && canDelete && styles.pressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Delete"
              accessibilityState={{ disabled: !canDelete }}>
              {deleting ? (
                <ActivityIndicator color={COLORS.primaryText} />
              ) : (
                <Text style={styles.deleteLabel}>Delete</Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  card: {
    borderRadius: 20,
    padding: 22,
    backgroundColor: COLORS.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.cardBorder,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.primaryText,
  },
  closeButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.6,
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    color: COLORS.secondaryText,
    marginBottom: 16,
  },
  bold: {
    fontWeight: '700',
    color: COLORS.primaryText,
  },
  prompt: {
    fontSize: 15,
    lineHeight: 22,
    color: COLORS.secondaryText,
    marginBottom: 10,
  },
  input: {
    height: 52,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    backgroundColor: COLORS.cardAlt,
    color: COLORS.primaryText,
    fontSize: 16,
    letterSpacing: 1,
  },
  errorText: {
    marginTop: 12,
    fontSize: 13,
    color: DESTRUCTIVE_COLOR,
    lineHeight: 18,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 22,
  },
  cancelButton: {
    height: 46,
    paddingHorizontal: 22,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.cardBorder,
  },
  cancelLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.primaryText,
  },
  deleteButton: {
    minWidth: 100,
    height: 46,
    paddingHorizontal: 22,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#B91C1C',
  },
  deleteButtonDisabled: {
    backgroundColor: COLORS.disabled,
  },
  deleteLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.primaryText,
  },
});
