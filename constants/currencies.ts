// Supported store default currencies. Starts with USD; structured as a list so
// more can be added without touching the selector UI. Keep in sync with the
// backend allow-list in supabase/functions/create-btcpay-store/index.ts.

export interface CurrencyOption {
  code: string;
  label: string;
}

export const SUPPORTED_CURRENCIES: readonly CurrencyOption[] = [
  { code: 'USD', label: 'US Dollar' },
];

export const DEFAULT_CURRENCY = 'USD';

export function currencyLabel(code: string): string {
  return SUPPORTED_CURRENCIES.find((c) => c.code === code)?.label ?? code;
}
