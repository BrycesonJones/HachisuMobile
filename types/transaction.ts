export type TransactionStatus = 'complete' | 'failed' | 'canceled' | 'pending';

export type PaymentNetwork = 'bitcoin' | 'lightning' | 'cash_balance' | 'external_wallet';

export interface Transaction {
  id: string;
  date: string;
  time: string;
  amountUsd: number;
  amountBtc?: string;
  description: string;
  customerEmail?: string;
  payerName: string;
  status: TransactionStatus;
  paymentSource?: string;
  paymentNetwork?: PaymentNetwork;
  transactionNumber: string;
  merchantName?: string;
  fees?: string;
}
