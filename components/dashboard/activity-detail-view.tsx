import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import * as Clipboard from 'expo-clipboard';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CloseButton } from '@/components/auth/close-button';
import { DASHBOARD_COLORS } from '@/constants/dashboard-colors';
import {
  formatActivityAmount,
  formatActivityDateTime,
  getActivityStatusDescription,
  getPaymentMethodLabel,
  getSourceFeatureLabel,
} from '@/lib/transactions/activity-utils';
import type { ActivityItem } from '@/types/activity';

interface ActivityDetailViewProps {
  item: ActivityItem;
  onClose: () => void;
}

export function ActivityDetailView({ item, onClose }: ActivityDetailViewProps) {
  const amount = formatActivityAmount(item.amount, item.currency);

  async function handleCopyInvoiceId() {
    await Clipboard.setStringAsync(item.btcpayInvoiceId);
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right', 'bottom']}>
      <View style={styles.header}>
        <CloseButton onPress={onClose} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled">
        <View style={styles.summary}>
          <Text style={styles.title}>{item.title}</Text>
          <Text style={styles.dateTime}>{formatActivityDateTime(item.createdAt)}</Text>
          {item.description ? (
            <Text style={styles.description}>{item.description}</Text>
          ) : null}
          <Text style={styles.amount}>{amount}</Text>
          {item.btcAmount ? (
            <Text style={styles.btcAmount}>{item.btcAmount} BTC</Text>
          ) : null}
        </View>

        <View style={styles.divider} />

        <Text style={styles.sectionTitle}>Payment details</Text>

        <DetailRow
          icon="check-circle"
          title={item.displayStatus}
          subtitle={getActivityStatusDescription(item.status)}
        />

        <DetailRow icon="attach-money" title="Amount" subtitle={`${item.amount} ${item.currency}`} />

        {item.btcAmount ? (
          <DetailRow icon="currency-bitcoin" title="Bitcoin amount" subtitle={`${item.btcAmount} BTC`} />
        ) : null}

        <DetailRow
          icon="account-balance-wallet"
          title="Payment method"
          subtitle={getPaymentMethodLabel(item.paymentMethod)}
        />

        <DetailRow icon="storefront" title="Source" subtitle={getSourceFeatureLabel(item)} />

        <DetailRow
          icon="schedule"
          title="Created"
          subtitle={formatActivityDateTime(item.createdAt)}
        />

        {item.paidAt ? (
          <DetailRow icon="payments" title="Paid" subtitle={formatActivityDateTime(item.paidAt)} />
        ) : null}

        {item.settledAt ? (
          <DetailRow
            icon="verified"
            title="Settled"
            subtitle={formatActivityDateTime(item.settledAt)}
          />
        ) : null}

        {item.orderId ? (
          <DetailRow icon="tag" title="Order ID" subtitle={item.orderId} />
        ) : null}

        <DetailRow
          icon="receipt-long"
          title="Invoice ID"
          subtitle={item.btcpayInvoiceId}
          trailingIcon="content-copy"
          onTrailingPress={handleCopyInvoiceId}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

interface DetailRowProps {
  icon: keyof typeof MaterialIcons.glyphMap;
  title: string;
  subtitle: string;
  trailingIcon?: keyof typeof MaterialIcons.glyphMap;
  onTrailingPress?: () => void;
}

function DetailRow({ icon, title, subtitle, trailingIcon, onTrailingPress }: DetailRowProps) {
  return (
    <View style={styles.detailRow}>
      <MaterialIcons name={icon} size={24} color={DASHBOARD_COLORS.primaryText} />

      <View style={styles.detailContent}>
        <Text style={styles.detailTitle}>{title}</Text>
        <Text style={styles.detailSubtitle}>{subtitle}</Text>
      </View>

      {trailingIcon ? (
        <Pressable
          onPress={onTrailingPress}
          style={({ pressed }) => [styles.trailingButton, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel={`${title} action`}>
          <MaterialIcons name={trailingIcon} size={20} color={DASHBOARD_COLORS.secondaryText} />
        </Pressable>
      ) : (
        <View style={styles.trailingSpacer} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: DASHBOARD_COLORS.background,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 8,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  pressed: {
    opacity: 0.7,
  },
  summary: {
    gap: 6,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: DASHBOARD_COLORS.primaryText,
  },
  dateTime: {
    fontSize: 15,
    color: DASHBOARD_COLORS.secondaryText,
  },
  description: {
    fontSize: 15,
    color: DASHBOARD_COLORS.secondaryText,
  },
  amount: {
    marginTop: 28,
    fontSize: 44,
    fontWeight: '700',
    color: DASHBOARD_COLORS.primaryText,
  },
  btcAmount: {
    fontSize: 16,
    color: DASHBOARD_COLORS.secondaryText,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: DASHBOARD_COLORS.divider,
    marginVertical: 28,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: DASHBOARD_COLORS.primaryText,
    marginBottom: 20,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 16,
    marginBottom: 28,
  },
  detailContent: {
    flex: 1,
    gap: 4,
  },
  detailTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: DASHBOARD_COLORS.primaryText,
  },
  detailSubtitle: {
    fontSize: 15,
    lineHeight: 22,
    color: DASHBOARD_COLORS.secondaryText,
  },
  trailingButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trailingSpacer: {
    width: 32,
  },
});
