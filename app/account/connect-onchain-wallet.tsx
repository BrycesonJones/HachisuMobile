import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { COLORS } from '@/constants/colors';

// Front of the per-store on-chain wallet setup flow:
//   Let's get started → Choose your import method → Enter xpub → Confirm addresses
// Always store-scoped: storeId / storeName are threaded through every step.
export default function ConnectOnchainWalletScreen() {
  const router = useRouter();
  const { storeId, storeName } = useLocalSearchParams<{
    storeId?: string;
    storeName?: string;
  }>();

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

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.title}>Let&apos;s get started</Text>

        <Pressable
          onPress={() =>
            router.push({
              pathname: '/account/import-wallet',
              params: { storeId: storeId ?? '', storeName: storeName ?? '' },
            })
          }
          style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          accessibilityRole="button"
          accessibilityLabel="Connect an existing wallet">
          <MaterialIcons
            name="account-balance-wallet"
            size={24}
            color={COLORS.primaryText}
          />
          <View style={styles.rowText}>
            <Text style={styles.rowTitle}>Connect an existing wallet</Text>
            <Text style={styles.rowSubtitle}>
              Import an existing hardware or software wallet
            </Text>
          </View>
          <MaterialIcons name="chevron-right" size={24} color={COLORS.secondaryText} />
        </Pressable>
      </ScrollView>
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
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  title: {
    marginTop: 24,
    marginBottom: 40,
    fontSize: 28,
    fontWeight: '700',
    color: COLORS.primaryText,
    textAlign: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: COLORS.card,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.cardBorder,
    padding: 16,
  },
  rowPressed: {
    opacity: 0.7,
  },
  rowText: {
    flex: 1,
  },
  rowTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: COLORS.primaryText,
  },
  rowSubtitle: {
    marginTop: 2,
    fontSize: 13,
    color: COLORS.secondaryText,
  },
});
