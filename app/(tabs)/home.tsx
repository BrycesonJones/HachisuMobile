import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StatusBar, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DashboardHeader } from '@/components/dashboard/dashboard-header';
import { TransactionDetailsModal } from '@/components/dashboard/transaction-details-modal';
import { TransactionList } from '@/components/dashboard/transaction-list';
import { DASHBOARD_COLORS } from '@/constants/dashboard-colors';
import { useAuth } from '@/contexts/auth-context';
import { MOCK_TRANSACTIONS } from '@/data/mock-transactions';
import type { Transaction } from '@/types/transaction';

export default function MerchantDashboardScreen() {
  const router = useRouter();
  const { signOut } = useAuth();
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);

  function handleTransactionPress(transaction: Transaction) {
    setSelectedTransaction(transaction);
  }

  function handleCloseDetails() {
    setSelectedTransaction(null);
  }

  async function handleProfilePress() {
    await signOut();
    router.replace('/');
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="light-content" />

      <TransactionList
        transactions={MOCK_TRANSACTIONS}
        onTransactionPress={handleTransactionPress}
        ListHeaderComponent={<DashboardHeader onProfilePress={handleProfilePress} />}
      />

      <TransactionDetailsModal
        transaction={selectedTransaction}
        visible={selectedTransaction !== null}
        onClose={handleCloseDetails}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: DASHBOARD_COLORS.background,
  },
});
