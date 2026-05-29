import { DashboardHeader } from '@/components/dashboard/dashboard-header';
import { TransactionList } from '@/components/dashboard/transaction-list';
import { MOCK_TRANSACTIONS } from '@/data/mock-transactions';
import type { Transaction } from '@/types/transaction';

interface ActivityDashboardViewProps {
  onTransactionPress: (transaction: Transaction) => void;
}

export function ActivityDashboardView({ onTransactionPress }: ActivityDashboardViewProps) {
  return (
    <TransactionList
      transactions={MOCK_TRANSACTIONS}
      onTransactionPress={onTransactionPress}
      ListHeaderComponent={<DashboardHeader />}
    />
  );
}
