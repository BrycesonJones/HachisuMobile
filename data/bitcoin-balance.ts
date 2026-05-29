export interface BitcoinBalance {
  /** USD value of the user's Bitcoin balance. */
  usdValue: number;
  /** Amount of Bitcoin owned, in BTC. */
  btcAmount: number;
}

/**
 * Placeholder Bitcoin balance. Replace this with real data from
 * Supabase / BTCPay Server / wallet balance once connected.
 */
export const bitcoinBalance: BitcoinBalance = {
  usdValue: 0,
  btcAmount: 0,
};
