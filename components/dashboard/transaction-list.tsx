import { SectionList, StyleSheet, Text, View } from 'react-native';

import { TransactionRow } from '@/components/dashboard/transaction-row';
import { DASHBOARD_COLORS } from '@/constants/dashboard-colors';
import { groupTransactionsByMonth } from '@/lib/transactions/transaction-utils';
import type { Transaction } from '@/types/transaction';

interface TransactionListProps {
  transactions: Transaction[];
  onTransactionPress: (transaction: Transaction) => void;
  ListHeaderComponent?: React.ReactElement | null;
}

export function TransactionList({
  transactions,
  onTransactionPress,
  ListHeaderComponent,
}: TransactionListProps) {
  const sections = groupTransactionsByMonth(transactions);

  return (
    <SectionList
      sections={sections}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => (
        <TransactionRow transaction={item} onPress={onTransactionPress} />
      )}
      renderSectionHeader={({ section }) => (
        <SectionHeader title={section.title} />
      )}
      ListHeaderComponent={ListHeaderComponent}
      stickySectionHeadersEnabled={false}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.contentContainer}
    />
  );
}

interface SectionHeaderProps {
  title: string;
}

function SectionHeader({ title }: SectionHeaderProps) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  contentContainer: {
    paddingBottom: 32,
  },
  sectionHeader: {
    paddingHorizontal: 20,
    paddingTop: 28,
    paddingBottom: 8,
    backgroundColor: DASHBOARD_COLORS.background,
  },
  sectionTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: DASHBOARD_COLORS.primaryText,
  },
});
