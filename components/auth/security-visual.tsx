import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { StyleSheet, View } from 'react-native';

import { COLORS } from '@/constants/colors';

export function SecurityVisual() {
  return (
    <View style={styles.container}>
      <View style={styles.shield}>
        <MaterialIcons name="shield" size={120} color={COLORS.cardBorder} />
        <View style={styles.lockOverlay}>
          <MaterialIcons name="lock" size={48} color={COLORS.secondaryText} />
          <View style={styles.faceOverlay}>
            <MaterialIcons name="face" size={20} color={COLORS.mutedText} />
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
  },
  shield: {
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.9,
  },
  lockOverlay: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    top: 52,
  },
  faceOverlay: {
    position: 'absolute',
    top: 14,
  },
});
