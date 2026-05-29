import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { TransactionDetailsView } from '@/components/dashboard/transaction-details-view';
import { DASHBOARD_COLORS } from '@/constants/dashboard-colors';
import { getTransactionById } from '@/data/mock-transactions';

export default function TransactionDetailsScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const transaction = typeof id === 'string' ? getTransactionById(id) : undefined;

  useEffect(() => {
    if (id != null && transaction == null) {
      router.back();
    }
  }, [id, router, transaction]);

  if (!transaction) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={DASHBOARD_COLORS.primaryText} />
      </View>
    );
  }

  function handleClose() {
    router.back();
  }

  return <TransactionDetailsView transaction={transaction} onClose={handleClose} />;
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: DASHBOARD_COLORS.background,
  },
});
