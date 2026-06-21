import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import { Pressable, StatusBar, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { COLORS } from '@/constants/colors';
import { HachisuColors } from '@/constants/hachisu-colors';
import { useActiveStore } from '@/contexts/active-store-context';

interface PaymentPlaceholderScreenProps {
  /** Icon shown in the badge — mirrors the dashboard card icon. */
  icon: keyof typeof MaterialIcons.glyphMap;
  title: string;
  description: string;
}

/**
 * Shared scaffold for the not-yet-built payment feature screens. Matches the
 * dark Hachisu style and the account screens' back-header pattern, scopes the
 * copy to the active store, and shows a "Coming soon" message. No backend
 * calls, no mock payment logic — purely a placeholder.
 */
export function PaymentPlaceholderScreen({
  icon,
  title,
  description,
}: PaymentPlaceholderScreenProps) {
  const router = useRouter();
  const { activeStore } = useActiveStore();

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="light-content" />

      <View style={styles.headerRow}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Go back">
          <MaterialIcons name="chevron-left" size={24} color={COLORS.primaryText} />
        </Pressable>
        <Text style={styles.title}>{title}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.body}>
        <View style={styles.iconBadge}>
          <MaterialIcons name={icon} size={32} color={HachisuColors.cream} />
        </View>

        {activeStore ? (
          <Text style={styles.storeLabel} numberOfLines={1}>
            {activeStore.name}
          </Text>
        ) : null}

        <Text style={styles.comingSoon}>Coming soon</Text>
        <Text style={styles.description}>{description}</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 16,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.7,
  },
  title: {
    flex: 1,
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '600',
    color: COLORS.primaryText,
  },
  headerSpacer: {
    width: 40,
    height: 40,
  },
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingBottom: 64,
    gap: 12,
  },
  iconBadge: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    marginBottom: 8,
  },
  storeLabel: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: COLORS.secondaryText,
  },
  comingSoon: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.primaryText,
  },
  description: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    color: COLORS.secondaryText,
  },
});
