import type { Transaction } from '@/types/transaction';

export const MOCK_TRANSACTIONS: Transaction[] = [
  {
    id: 'tx-001',
    date: '2025-10-27',
    time: '10:04',
    amountUsd: 197.0,
    amountBtc: '0.00166183',
    description: 'Buy Bitcoin With This',
    payerName: 'Aubrey Holloway',
    status: 'complete',
    paymentSource: 'Lightning wallet',
    paymentNetwork: 'lightning',
    transactionNumber: 'D-3P1445LK',
    merchantName: 'Hachisu Coffee Co.',
    fees: 'None applied',
  },
];

export function getTransactionById(id: string): Transaction | undefined {
  return MOCK_TRANSACTIONS.find((transaction) => transaction.id === id);
}
