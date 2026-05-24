import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import * as Clipboard from 'expo-clipboard';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DASHBOARD_COLORS } from '@/constants/dashboard-colors';
import {
  formatCurrency,
  formatDetailDateTime,
  getPaymentSourceLabel,
  getStatusDescription,
  getStatusLabel,
} from '@/lib/transactions/transaction-utils';
import type { Transaction } from '@/types/transaction';

interface TransactionDetailsModalProps {
  transaction: Transaction | null;
  visible: boolean;
  onClose: () => void;
}

export function TransactionDetailsModal({
  transaction,
  visible,
  onClose,
}: TransactionDetailsModalProps) {
  if (!transaction) return null;

  const merchantName = transaction.merchantName ?? 'Your business';
  const fees = transaction.fees ?? 'None applied';

  const transactionNumber = transaction.transactionNumber;

  async function handleCopyTransactionNumber() {
    await Clipboard.setStringAsync(`#${transactionNumber}`);
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen">
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right', 'bottom']}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}>
          <Pressable
            onPress={onClose}
            style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Close transaction details">
            <MaterialIcons name="close" size={28} color={DASHBOARD_COLORS.primaryText} />
          </Pressable>

          <View style={styles.summary}>
            <Text style={styles.payerName}>{transaction.payerName}</Text>
            <Text style={styles.dateTime}>
              {formatDetailDateTime(transaction.date, transaction.time)}
            </Text>
            <Text style={styles.description}>{transaction.description}</Text>
            {transaction.customerEmail ? (
              <Text style={styles.customerEmail}>{transaction.customerEmail}</Text>
            ) : null}
            <Text style={styles.amount}>{formatCurrency(transaction.amountUsd)}</Text>
            {transaction.amountBtc ? (
              <Text style={styles.btcAmount}>{transaction.amountBtc} BTC</Text>
            ) : null}
          </View>

          <View style={styles.divider} />

          <Text style={styles.sectionTitle}>Transaction details</Text>

          <DetailRow
            icon="check-circle"
            title={getStatusLabel(transaction.status)}
            subtitle={getStatusDescription(transaction.status)}
          />

          <DetailRow
            icon="person-outline"
            title="Payment between"
            subtitle={`To: ${merchantName}\nFrom: ${transaction.payerName}`}
          />

          <DetailRow
            icon="attach-money"
            title="Payment source"
            subtitle={getPaymentSourceLabel(transaction)}
          />

          <DetailRow
            icon="receipt-long"
            title="Fees"
            subtitle={fees}
            trailingIcon="info-outline"
          />

          <DetailRow
            icon="tag"
            title="Transaction number"
            subtitle={`#${transaction.transactionNumber}`}
            trailingIcon="content-copy"
            onTrailingPress={handleCopyTransactionNumber}
          />
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

interface DetailRowProps {
  icon: keyof typeof MaterialIcons.glyphMap;
  title: string;
  subtitle: string;
  trailingIcon?: keyof typeof MaterialIcons.glyphMap;
  onTrailingPress?: () => void;
}

function DetailRow({
  icon,
  title,
  subtitle,
  trailingIcon,
  onTrailingPress,
}: DetailRowProps) {
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
          <MaterialIcons
            name={trailingIcon}
            size={20}
            color={DASHBOARD_COLORS.secondaryText}
          />
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
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  closeButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
    marginLeft: -8,
  },
  pressed: {
    opacity: 0.7,
  },
  summary: {
    marginTop: 8,
    gap: 6,
  },
  payerName: {
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
  customerEmail: {
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
