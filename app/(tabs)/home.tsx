import { useRouter } from 'expo-router';
import { StatusBar, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DashboardHeader } from '@/components/dashboard/dashboard-header';
import { TransactionList } from '@/components/dashboard/transaction-list';
import { DASHBOARD_COLORS } from '@/constants/dashboard-colors';
import { MOCK_TRANSACTIONS } from '@/data/mock-transactions';
import type { Transaction } from '@/types/transaction';

export default function MerchantDashboardScreen() {
  const router = useRouter();

  function handleTransactionPress(transaction: Transaction) {
    router.push({
      pathname: '/transaction-details',
      params: { id: transaction.id },
    });
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="light-content" />

      <TransactionList
        transactions={MOCK_TRANSACTIONS}
        onTransactionPress={handleTransactionPress}
        ListHeaderComponent={<DashboardHeader />}
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
