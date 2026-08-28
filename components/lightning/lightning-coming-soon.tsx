import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import { Pressable, StatusBar, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { COLORS } from '@/constants/colors';
import { LIGHTNING_BETA_LABEL } from '@/constants/feature-flags';

/**
 * Placeholder rendered in place of any Lightning screen while LIGHTNING_ENABLED
 * is off. Guards the screens themselves (not just their entry points) so a deep
 * link or stale route can't reach a live Lightning flow — and no Lightning/Boltz
 * call ever fires behind it.
 */
export function LightningComingSoonScreen() {
  const router = useRouter();

  function close() {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)/home');
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="light-content" />

      <View style={styles.headerRow}>
        <Pressable
          onPress={close}
          style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Close"
          hitSlop={8}>
          <MaterialIcons name="close" size={24} color={COLORS.primaryText} />
        </Pressable>
      </View>

      <View style={styles.body}>
        <View style={styles.iconCircle}>
          <MaterialIcons name="bolt" size={32} color={COLORS.secondaryText} />
        </View>
        <Text style={styles.title}>{LIGHTNING_BETA_LABEL}</Text>
        <Text style={styles.subtitle}>
          Coming soon. Lightning payments aren&apos;t available in Hachisu yet.
        </Text>
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
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
  },
  headerButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.7,
  },
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 16,
    marginTop: -48,
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: COLORS.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.cardBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.primaryText,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    color: COLORS.secondaryText,
    textAlign: 'center',
    lineHeight: 21,
  },
});
