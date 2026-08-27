import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { COLORS } from '@/constants/colors';
import { DASHBOARD_COLORS } from '@/constants/dashboard-colors';
import {
  formatActivityAmount,
  formatActivityDateTime,
  getDisplayStatusTone,
  getExceptionStatusNote,
  isMutedActivity,
} from '@/lib/transactions/activity-utils';
import type { ActivityItem } from '@/types/activity';

interface InvoiceRowProps {
  invoice: ActivityItem;
  onPress: (invoice: ActivityItem) => void;
}

/**
 * One invoice in the Invoices list. Shows the invoice LIFECYCLE — including
 * invoices that never got paid — which is what distinguishes this screen from
 * Activity. Status text always comes from the server-normalized status, never
 * from a raw BTCPay string compared in the component.
 */
export function InvoiceRow({ invoice, onPress }: InvoiceRowProps) {
  const muted = isMutedActivity(invoice.status);
  const tone = getDisplayStatusTone(invoice.displayStatus);
  const exceptionNote = getExceptionStatusNote(invoice.exceptionStatus);
  const amount = formatActivityAmount(invoice.amount, invoice.currency);
  // A partially paid invoice shows what actually arrived alongside what was due.
  const showPaid =
    invoice.paidAmount != null &&
    invoice.paidAmount !== invoice.amount &&
    invoice.paymentCount > 0;

  return (
    <Pressable
      onPress={() => onPress(invoice)}
      style={({ pressed }) => [styles.container, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={
        `${invoice.title}, ${amount}, ${invoice.displayStatus}` +
        (exceptionNote ? `, ${exceptionNote}` : '')
      }>
      <View style={styles.content}>
        <View style={styles.topRow}>
          <Text style={[styles.title, muted && styles.mutedText]} numberOfLines={1}>
            {invoice.description ?? invoice.title}
          </Text>
          <Text style={[styles.amount, muted && styles.mutedText]}>{amount}</Text>
        </View>

        <Text style={styles.dateLine} numberOfLines={1}>
          {formatActivityDateTime(invoice.createdAt)}
        </Text>

        <View style={styles.bottomRow}>
          <View style={styles.statusGroup}>
            <View style={[styles.statusDot, styles[`${tone}Dot`]]} />
            <Text style={[styles.statusText, styles[`${tone}Text`]]} numberOfLines={1}>
              {invoice.displayStatus}
              {exceptionNote ? ` · ${exceptionNote}` : ''}
            </Text>
          </View>
          {showPaid ? (
            <Text style={styles.paidText} numberOfLines={1}>
              {formatActivityAmount(invoice.paidAmount ?? '0', invoice.currency)} received
            </Text>
          ) : null}
        </View>

        <Text style={styles.idLine} numberOfLines={1}>
          {invoice.orderId ? `${invoice.orderId} · ` : ''}
          {invoice.btcpayInvoiceId}
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
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  statusGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 1,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 13,
    fontWeight: '600',
    flexShrink: 1,
  },
  positiveDot: {
    backgroundColor: DASHBOARD_COLORS.bitcoinGreen,
  },
  positiveText: {
    color: DASHBOARD_COLORS.bitcoinGreen,
  },
  pendingDot: {
    backgroundColor: DASHBOARD_COLORS.warningText,
  },
  pendingText: {
    color: DASHBOARD_COLORS.warningText,
  },
  mutedDot: {
    backgroundColor: DASHBOARD_COLORS.failedText,
  },
  mutedText: {
    color: DASHBOARD_COLORS.mutedText,
  },
  paidText: {
    fontSize: 12,
    color: DASHBOARD_COLORS.warningText,
  },
  idLine: {
    fontSize: 11,
    color: DASHBOARD_COLORS.failedText,
  },
});
