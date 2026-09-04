import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { COLORS } from '@/constants/colors';
import { DASHBOARD_COLORS } from '@/constants/dashboard-colors';
import type { PaymentRequestListItem } from '@/lib/btcpay/payment-request-list';
import {
  formatActivityAmount,
  formatActivityDateTime,
} from '@/lib/transactions/activity-utils';

interface RequestRowProps {
  request: PaymentRequestListItem;
  onPress: (request: PaymentRequestListItem) => void;
}

/**
 * One payment request in the list. Shows what Hachisu recorded at creation —
 * title, amount, when it was created, its ids — and nothing about payment
 * state: status lives in BTCPay and is rendered by the detail screen only.
 */
export function RequestRow({ request, onPress }: RequestRowProps) {
  const amount = formatActivityAmount(request.amount, request.currency);

  return (
    <Pressable
      onPress={() => onPress(request)}
      style={({ pressed }) => [styles.container, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={`${request.title}, ${amount}`}
      accessibilityHint="Opens the payment request">
      <View style={styles.content}>
        <View style={styles.topRow}>
          <Text style={styles.title} numberOfLines={1}>
            {request.title}
          </Text>
          <Text style={styles.amount}>{amount}</Text>
        </View>

        <Text style={styles.dateLine} numberOfLines={1}>
          {formatActivityDateTime(request.createdAt)}
          {request.expiresAt ? ` · Expires ${formatActivityDateTime(request.expiresAt)}` : ''}
        </Text>

        <Text style={styles.idLine} numberOfLines={1}>
          {request.referenceId ? `${request.referenceId} · ` : ''}
          {request.btcpayPaymentRequestId}
        </Text>
      </View>

      <MaterialIcons name="chevron-right" size={22} color={COLORS.secondaryText} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 14,
    marginTop: 10,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.cardBorder,
    backgroundColor: COLORS.cardAlt,
  },
  pressed: {
    opacity: 0.7,
  },
  content: {
    flex: 1,
    gap: 4,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  title: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.primaryText,
  },
  amount: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.primaryText,
  },
  dateLine: {
    fontSize: 13,
    color: COLORS.secondaryText,
  },
  idLine: {
    fontSize: 11,
    color: DASHBOARD_COLORS.failedText,
  },
});
