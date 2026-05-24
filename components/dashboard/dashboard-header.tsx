import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { DASHBOARD_COLORS } from '@/constants/dashboard-colors';
import { COLORS } from '@/constants/colors';
import { HachisuColors } from '@/constants/hachisu-colors';

interface DashboardHeaderProps {
  onSearchPress?: () => void;
  onProfilePress?: () => void;
}

export function DashboardHeader({ onSearchPress, onProfilePress }: DashboardHeaderProps) {
  return (
    <View style={styles.container}>
      <View style={styles.iconButton}>
        <View style={styles.brandIcon}>
          <Text style={styles.brandLetter}>H</Text>
        </View>
      </View>

      <View style={styles.actions}>
        <Pressable
          onPress={onSearchPress}
          style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Search transactions">
          <MaterialIcons name="search" size={24} color={DASHBOARD_COLORS.primaryText} />
        </Pressable>

        <Pressable
          onPress={onProfilePress}
          style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Account profile">
          <View style={styles.profileIcon}>
            <MaterialIcons name="person" size={18} color={HachisuColors.white} />
          </View>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandLetter: {
    fontSize: 18,
    fontWeight: '700',
    color: HachisuColors.white,
  },
  profileIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: DASHBOARD_COLORS.profileBlue,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.7,
  },
});
