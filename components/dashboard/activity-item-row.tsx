import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { DASHBOARD_COLORS } from '@/constants/dashboard-colors';
import { HachisuColors } from '@/constants/hachisu-colors';
import {
  formatActivityListDate,
  formatEventAmount,
  getActivityPaymentLabel,
  getExceptionStatusNote,
  isMutedEvent,
} from '@/lib/transactions/activity-utils';
import type { StoreActivityEvent } from '@/types/activity';

interface ActivityItemRowProps {
  event: StoreActivityEvent;
  onPress: (event: StoreActivityEvent) => void;
}

/**
 * One PAYMENT in the Activity feed. The row stays a simple mobile summary
 * (amount, rail, date, status) while the underlying record carries the full set
 * of canonical identifiers — invoice id, payment id, method id, rate, fee,
 * address — used to reconcile against BTCPay's reporting.
 */
export function ActivityItemRow({ event, onPress }: ActivityItemRowProps) {
  const muted = isMutedEvent(event);
  const amount = formatEventAmount(event);
  const dateLabel = formatActivityListDate(event.receivedAt);
  const paymentLabel = getActivityPaymentLabel(event);
  const exceptionNote = getExceptionStatusNote(event.invoiceExceptionStatus);

  function handlePress() {
    onPress(event);
  }

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [styles.container, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={
        `${event.title}, ${amount}, ${paymentLabel}, ${event.displayStatus}` +
        (exceptionNote ? `, ${exceptionNote}` : '')
      }>
      <ActivityAvatar event={event} muted={muted} />

      <View style={styles.content}>
        <Text style={[styles.title, muted && styles.mutedText]} numberOfLines={1}>
          {event.title}
        </Text>
        <Text style={[styles.subtitle, muted && styles.mutedText]} numberOfLines={1}>
          {paymentLabel}
        </Text>
        <Text style={[styles.dateLine, muted && styles.mutedText]} numberOfLines={1}>
          {dateLabel} · {event.displayStatus}
        </Text>
        {exceptionNote ? (
          <Text style={styles.exceptionMarker} numberOfLines={1}>
            {exceptionNote}
          </Text>
        ) : null}
      </View>

      <Text style={[styles.amount, muted && styles.mutedAmount]}>{amount}</Text>
    </Pressable>
  );
}

interface ActivityAvatarProps {
  event: StoreActivityEvent;
  muted: boolean;
}

function ActivityAvatar({ event, muted }: ActivityAvatarProps) {
  const icon = event.paymentRail === 'lightning' ? 'bolt' : 'currency-bitcoin';
  return (
    <View style={[styles.avatar, muted ? styles.mutedAvatar : styles.bitcoinAvatar]}>
      <MaterialIcons name={icon} size={22} color={HachisuColors.white} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 18,
    gap: 14,
  },
  pressed: {
    opacity: 0.7,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bitcoinAvatar: {
    backgroundColor: DASHBOARD_COLORS.bitcoinOrange,
  },
  mutedAvatar: {
    backgroundColor: DASHBOARD_COLORS.iconBackground,
  },
  content: {
    flex: 1,
    gap: 3,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: DASHBOARD_COLORS.primaryText,
  },
  subtitle: {
    fontSize: 15,
    color: DASHBOARD_COLORS.secondaryText,
  },
  dateLine: {
    fontSize: 14,
    color: DASHBOARD_COLORS.secondaryText,
  },
  exceptionMarker: {
    fontSize: 13,
    color: DASHBOARD_COLORS.warningText,
  },
  amount: {
    fontSize: 17,
    fontWeight: '700',
    color: DASHBOARD_COLORS.primaryText,
    minWidth: 72,
    textAlign: 'right',
  },
  mutedText: {
    color: DASHBOARD_COLORS.mutedText,
  },
  mutedAmount: {
    color: DASHBOARD_COLORS.failedText,
  },
});
