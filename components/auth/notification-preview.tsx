import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { StyleSheet, Text, View } from 'react-native';

import { COLORS } from '@/constants/colors';

export function NotificationPreview() {
  return (
    <View style={styles.container}>
      <View style={[styles.stackCard, styles.stackCardBack]} />
      <View style={[styles.stackCard, styles.stackCardMid]} />
      <View style={styles.mainCard}>
        <View style={styles.iconTile}>
          <MaterialIcons name="bolt" size={20} color={COLORS.primaryText} />
        </View>
        <View style={styles.textContent}>
          <Text style={styles.title}>Payment received</Text>
          <Text style={styles.message}>You received a bitcoin payment</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 160,
    paddingVertical: 24,
  },
  stackCard: {
    position: 'absolute',
    width: '88%',
    height: 72,
    borderRadius: 20,
    backgroundColor: COLORS.card,
    opacity: 0.35,
  },
  stackCardBack: {
    top: 8,
    transform: [{ scale: 0.92 }],
  },
  stackCardMid: {
    top: 20,
    opacity: 0.5,
    transform: [{ scale: 0.96 }],
  },
  mainCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    width: '100%',
    backgroundColor: COLORS.card,
    borderRadius: 20,
    padding: 16,
    marginTop: 32,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  iconTile: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: COLORS.cardAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textContent: {
    flex: 1,
    gap: 4,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.primaryText,
  },
  message: {
    fontSize: 14,
    color: COLORS.secondaryText,
  },
});
