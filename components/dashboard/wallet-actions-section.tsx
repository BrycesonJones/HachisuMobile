import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { SendMethodSheet } from '@/components/dashboard/send-method-sheet';
import { DASHBOARD_COLORS } from '@/constants/dashboard-colors';
import { HachisuColors } from '@/constants/hachisu-colors';

const SEND_ROUTE = '/wallet/send/scan';
const RECEIVE_ROUTE = '/wallet/receive';

/**
 * Dashboard WALLET section: Receive and Send actions below the PAYMENTS grid.
 * Same card language as PaymentFeatureCard, but action-shaped — icon + label,
 * no subtitle. Send opens the send-method sheet; Receive routes to its
 * placeholder screen until the Receive flow is built.
 */
export function WalletActionsSection() {
  const router = useRouter();
  const [sheetOpen, setSheetOpen] = useState(false);

  // iOS cannot push a screen while the RN Modal is still dismissing, so we
  // defer navigation until the sheet has finished closing (same pattern as
  // StoreSelector).
  const pendingRouteRef = useRef<string | null>(null);

  const navigatePending = useCallback(() => {
    const route = pendingRouteRef.current;
    if (!route) return;
    pendingRouteRef.current = null;
    router.push(route as never);
  }, [router]);

  const selectBitcoinWallet = useCallback(() => {
    setSheetOpen(false);
    pendingRouteRef.current = SEND_ROUTE;
    if (Platform.OS === 'ios') {
      setTimeout(navigatePending, 400);
    } else {
      requestAnimationFrame(navigatePending);
    }
  }, [navigatePending]);

  return (
    <View style={styles.root}>
      <Text style={styles.label}>WALLET</Text>
      <View style={styles.grid}>
        <WalletActionCard
          title="Receive"
          icon="arrow-downward"
          accessibilityHint="Opens Receive bitcoin"
          onPress={() => router.push(RECEIVE_ROUTE as never)}
        />
        <WalletActionCard
          title="Send"
          icon="arrow-upward"
          accessibilityHint="Opens Send bitcoin"
          onPress={() => setSheetOpen(true)}
        />
      </View>

      <SendMethodSheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onSelectBitcoinWallet={selectBitcoinWallet}
      />
    </View>
  );
}

interface WalletActionCardProps {
  title: string;
  icon: keyof typeof MaterialIcons.glyphMap;
  accessibilityHint: string;
  onPress: () => void;
}

function WalletActionCard({ title, icon, accessibilityHint, onPress }: WalletActionCardProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={accessibilityHint}>
      <View style={styles.iconBadge}>
        <MaterialIcons name={icon} size={24} color={HachisuColors.cream} />
      </View>
      <Text style={styles.title} numberOfLines={1}>
        {title}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    paddingHorizontal: 20,
    paddingTop: 24,
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1,
    color: DASHBOARD_COLORS.secondaryText,
    marginBottom: 14,
  },
  grid: {
    flexDirection: 'row',
    columnGap: 14,
  },
  card: {
    flex: 1,
    minHeight: 128,
    borderRadius: 22,
    padding: 18,
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  pressed: {
    opacity: 0.6,
  },
  iconBadge: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
    color: DASHBOARD_COLORS.primaryText,
  },
});
