import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { DASHBOARD_COLORS } from '@/constants/dashboard-colors';
import { HachisuColors } from '@/constants/hachisu-colors';
import {
  formatCurrency,
  formatListDate,
  getAvatarInitial,
  getStatusLabel,
  getTransactionSubtitle,
  getTransactionTitle,
  isMutedTransaction,
} from '@/lib/transactions/transaction-utils';
import type { Transaction } from '@/types/transaction';

interface TransactionRowProps {
  transaction: Transaction;
  onPress: (transaction: Transaction) => void;
}

export function TransactionRow({ transaction, onPress }: TransactionRowProps) {
  const isMuted = isMutedTransaction(transaction.status);
  const title = getTransactionTitle(transaction);
  const subtitle = getTransactionSubtitle(transaction);
  const dateLabel = formatListDate(transaction.date);
  const statusSuffix =
    transaction.status === 'failed' || transaction.status === 'canceled'
      ? ` · ${getStatusLabel(transaction.status)}`
      : '';

  function handlePress() {
    onPress(transaction);
  }

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [styles.container, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${formatCurrency(transaction.amountUsd)}`}>
      <TransactionAvatar transaction={transaction} isMuted={isMuted} />

      <View style={styles.content}>
        <Text style={[styles.title, isMuted && styles.mutedText]} numberOfLines={1}>
          {title}
        </Text>
        <Text style={[styles.subtitle, isMuted && styles.mutedText]} numberOfLines={1}>
          {subtitle}
        </Text>
        <Text style={[styles.dateLine, isMuted && styles.mutedText]} numberOfLines={1}>
          {dateLabel}
          {statusSuffix}
        </Text>
      </View>

      <Text
        style={[
          styles.amount,
          isMuted && styles.mutedAmount,
          isMuted && styles.strikethrough,
        ]}>
        {formatCurrency(transaction.amountUsd)}
      </Text>
    </Pressable>
  );
}

interface TransactionAvatarProps {
  transaction: Transaction;
  isMuted: boolean;
}

function TransactionAvatar({ transaction, isMuted }: TransactionAvatarProps) {
  if (transaction.payerName === 'Bitcoin buy') {
    return (
      <View style={[styles.avatar, styles.bitcoinAvatar, isMuted && styles.mutedAvatar]}>
        <MaterialIcons name="currency-bitcoin" size={22} color={HachisuColors.white} />
      </View>
    );
  }

  if (transaction.payerName === 'Add money') {
    return (
      <View style={[styles.avatar, styles.bitcoinAvatar, isMuted && styles.mutedAvatar]}>
        <MaterialIcons name="attach-money" size={24} color={HachisuColors.white} />
      </View>
    );
  }

  return (
    <View style={[styles.avatar, styles.personAvatar, isMuted && styles.mutedAvatar]}>
      <Text style={[styles.avatarInitial, isMuted && styles.mutedAvatarInitial]}>
        {getAvatarInitial(transaction.payerName)}
      </Text>
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
    backgroundColor: DASHBOARD_COLORS.bitcoinGreen,
  },
  personAvatar: {
    backgroundColor: DASHBOARD_COLORS.avatarBackground,
  },
  mutedAvatar: {
    backgroundColor: DASHBOARD_COLORS.iconBackground,
  },
  avatarInitial: {
    fontSize: 20,
    fontWeight: '700',
    color: HachisuColors.white,
  },
  mutedAvatarInitial: {
    color: DASHBOARD_COLORS.secondaryText,
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
  strikethrough: {
    textDecorationLine: 'line-through',
  },
});
