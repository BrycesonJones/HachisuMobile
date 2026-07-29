// Mobile-side shape of a BTCPay-derived Activity item. Mirrors the normalized
// output of the get-btcpay-store-activity Edge Function. BTCPay is the source of
// truth; the app only ever renders these normalized records (never raw BTCPay JSON).

export type ActivityStatus =
  | 'new'
  | 'processing'
  | 'settled'
  | 'expired'
  | 'invalid'
  | 'failed';

export type ActivityDisplayStatus =
  | 'Pending'
  | 'Processing'
  | 'Paid'
  | 'Settled'
  | 'Expired'
  | 'Failed';

export type ActivityPaymentMethod = 'BTC' | 'BTC-LN' | 'unknown';

export type ActivitySourceFeature =
  | 'pay_button'
  | 'invoice'
  | 'pos'
  | 'request'
  | 'unknown';

export interface ActivityItem {
  id: string;
  type: 'invoice';
  btcpayInvoiceId: string;
  status: ActivityStatus;
  displayStatus: ActivityDisplayStatus;
  /** Fiat/display amount as a string, e.g. "1.00". */
  amount: string;
  currency: string;
  /** Crypto amount as a string, when known. */
  btcAmount: string | null;
  paymentMethod: ActivityPaymentMethod;
  title: string;
  description: string | null;
  orderId: string | null;
  /** ISO timestamp. */
  createdAt: string;
  paidAt: string | null;
  settledAt: string | null;
  checkoutUrl: string | null;
  sourceFeature: ActivitySourceFeature;
  rawStatus: string;
}

export interface StoreActivityRange {
  startDate: string;
  endDate: string;
}

export interface StoreActivityResponse {
  ok: boolean;
  merchantStoreId: string;
  btcpayStoreId: string;
  source: 'btcpay';
  range: StoreActivityRange;
  items: ActivityItem[];
  nextOffset: number | null;
  error?: string;
}
