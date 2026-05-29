import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Pressable, StyleSheet, View } from 'react-native';

import { AccountProfileHub } from '@/components/account/account-profile-hub';
import { DASHBOARD_COLORS } from '@/constants/dashboard-colors';

interface DashboardHeaderProps {
  onSearchPress?: () => void;
}

export function DashboardHeader({ onSearchPress }: DashboardHeaderProps) {
  return (
    <View style={styles.container}>
      <Pressable
        onPress={onSearchPress}
        style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel="Search transactions">
        <MaterialIcons name="search" size={24} color={DASHBOARD_COLORS.primaryText} />
      </Pressable>

      <AccountProfileHub />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
  },
  iconButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.7,
  },
});
