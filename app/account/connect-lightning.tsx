import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, StatusBar, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { COLORS } from '@/constants/colors';

// Placeholder Lightning setup, scoped to the selected store. Replaced by the
// real Lightning connection flow once it exists. TODO: route into the real
// per-store Lightning setup when implemented.
export default function ConnectLightningScreen() {
  const router = useRouter();
  const { storeName } = useLocalSearchParams<{ storeId?: string; storeName?: string }>();

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="light-content" />

      <View style={styles.headerRow}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Close"
          hitSlop={8}>
          <MaterialIcons name="close" size={24} color={COLORS.primaryText} />
        </Pressable>
      </View>

      <View style={styles.body}>
        <View style={styles.iconCircle}>
          <MaterialIcons name="bolt" size={32} color={COLORS.primary} />
        </View>
        <Text style={styles.title}>Lightning setup is coming soon</Text>
        {storeName ? (
          <Text style={styles.subtitle}>
            We&apos;re building Lightning payments for {storeName}. Check back shortly.
          </Text>
        ) : (
          <Text style={styles.subtitle}>
            We&apos;re building Lightning payments for this store. Check back shortly.
          </Text>
        )}
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
  closeButton: {
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
