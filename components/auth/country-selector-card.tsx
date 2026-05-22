import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { COLORS } from '@/constants/colors';

interface CountrySelectorCardProps {
  label: string;
  value: string;
  onPress?: () => void;
}

export function CountrySelectorCard({ label, value, onPress }: CountrySelectorCardProps) {
  function handlePress() {
    // TODO: open country picker modal
    onPress?.();
  }

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [styles.container, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={`${label}, ${value}`}>
      <View style={styles.textBlock}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.value}>{value}</Text>
      </View>
      <View style={styles.chevronButton}>
        <MaterialIcons name="keyboard-arrow-down" size={24} color={COLORS.primaryText} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.cardAlt,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    padding: 20,
  },
  pressed: {
    opacity: 0.8,
  },
  textBlock: {
    flex: 1,
    gap: 4,
  },
  label: {
    fontSize: 13,
    color: COLORS.secondaryText,
  },
  value: {
    fontSize: 18,
    fontWeight: '500',
    color: COLORS.primaryText,
  },
  chevronButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
