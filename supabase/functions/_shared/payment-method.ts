// Authoritative normalization of a BTCPay payment method into a separated
// (asset, rail) model. BTCPay is the source of truth; this is the ONLY place the
// backend interprets a raw payment-method identifier. The mobile app never
// re-derives the rail — it renders the fields produced here.
//
// Payment-method identifiers observed in this deployment (source-verified against
// _shared/btcpay-client.ts and the installed Boltz plugin):
//   BTC-CHAIN / BTC-OnChain / BTC  -> Bitcoin, on-chain
//   BTC-LN / BTC-LightningNetwork  -> Bitcoin, Lightning
//   LBTC-CHAIN / LBTC-* / LBTC     -> Liquid (L-BTC). Not currently exposed as an
//                                     invoice payment method (Liquid lives inside
//                                     the Boltz daemon as the merchant's settlement
//                                     wallet) but mapped here so a Liquid payment
//                                     can NEVER be presented as ordinary BTC.
//
// Anything else is reported as `unknown` (never silently defaulted to on-chain BTC).

export type PaymentAsset = 'BTC' | 'L-BTC';

export type PaymentRail = 'onchain' | 'lightning' | 'liquid' | 'unknown';

export type PaymentMethodLabel =
  | 'Bitcoin · On-chain'
  | 'Bitcoin · Lightning'
  | 'Liquid'
  | 'Payment method unavailable';

/** Internal warning codes; logged server-side so unmapped methods can be added later. */
export type PaymentMethodWarning =
  | 'PAYMENT_METHOD_MISSING'
  | 'PAYMENT_METHOD_UNKNOWN'
  | 'PAYMENT_ASSET_MISSING'
  | 'PAYMENT_METHOD_ASSET_CONFLICT';

export interface NormalizedPaymentMethod {
  asset: PaymentAsset | null;
  paymentRail: PaymentRail;
  /** The raw identifier, preserved verbatim for logging/debugging. */
  paymentMethodId: string | null;
  paymentMethodLabel: PaymentMethodLabel;
  warning: PaymentMethodWarning | null;
}

const UNAVAILABLE: PaymentMethodLabel = 'Payment method unavailable';

/**
 * Normalizes a BTCPay payment-method identifier (and optional crypto code) into a
 * separated asset + rail model. Casing-insensitive. Returns `unknown`/null rather
 * than guessing, and never maps a Liquid-like identifier to BTC.
 */
export function normalizeBtcpayPaymentMethod(
  paymentMethodId: string | null,
  cryptoCode: string | null,
): NormalizedPaymentMethod {
  const rawId = normalizeToken(paymentMethodId);
  const rawCode = normalizeToken(cryptoCode);

  // Primary signal: the payment-method id (e.g. "BTC-CHAIN", "BTC-LN", "LBTC-CHAIN").
  const fromId = rawId ? classify(rawId) : null;

  if (fromId && fromId.paymentRail !== 'unknown') {
    // Cross-check the crypto code for a conflicting asset (id wins if they disagree).
    const codeAsset = rawCode ? assetFromCoin(coinToken(rawCode)) : null;
    const warning =
      codeAsset && fromId.asset && codeAsset !== fromId.asset
        ? 'PAYMENT_METHOD_ASSET_CONFLICT'
        : null;
    return { ...fromId, paymentMethodId: paymentMethodId ?? null, warning };
  }

  // No usable id — fall back to the crypto code for the ASSET only. The rail cannot
  // be derived from a crypto code alone, EXCEPT L-BTC which only exists on Liquid.
  if (rawCode) {
    const asset = assetFromCoin(coinToken(rawCode));
    if (asset === 'L-BTC') {
      return {
        asset: 'L-BTC',
        paymentRail: 'liquid',
        paymentMethodId: paymentMethodId ?? null,
        paymentMethodLabel: 'Liquid',
        warning: rawId ? 'PAYMENT_METHOD_UNKNOWN' : null,
      };
    }
    if (asset === 'BTC') {
      // Asset is authoritative but the rail is not knowable from the code alone.
      return {
        asset: 'BTC',
        paymentRail: 'unknown',
        paymentMethodId: paymentMethodId ?? null,
        paymentMethodLabel: UNAVAILABLE,
        warning: rawId ? 'PAYMENT_METHOD_UNKNOWN' : 'PAYMENT_METHOD_MISSING',
      };
    }
  }

  // Nothing usable at all.
  return {
    asset: null,
    paymentRail: 'unknown',
    paymentMethodId: paymentMethodId ?? null,
    paymentMethodLabel: UNAVAILABLE,
    warning: rawId
      ? 'PAYMENT_METHOD_UNKNOWN'
      : rawCode
        ? 'PAYMENT_ASSET_MISSING'
        : 'PAYMENT_METHOD_MISSING',
  };
}

/** Classifies a normalized (upper-cased, trimmed) identifier into asset + rail. */
function classify(id: string): Omit<NormalizedPaymentMethod, 'paymentMethodId' | 'warning'> {
  const coin = coinToken(id);
  const rail = railToken(id);
  const asset = assetFromCoin(coin);

  if (asset === 'L-BTC') {
    // Any Liquid method (chain or otherwise) is presented as "Liquid".
    return { asset: 'L-BTC', paymentRail: 'liquid', paymentMethodLabel: 'Liquid' };
  }
  if (asset === 'BTC') {
    if (rail === 'lightning') {
      return { asset: 'BTC', paymentRail: 'lightning', paymentMethodLabel: 'Bitcoin · Lightning' };
    }
    // "BTC-CHAIN", "BTC-OnChain", or bare "BTC" (legacy) are all on-chain.
    return { asset: 'BTC', paymentRail: 'onchain', paymentMethodLabel: 'Bitcoin · On-chain' };
  }
  return { asset: null, paymentRail: 'unknown', paymentMethodLabel: UNAVAILABLE };
}

/** First segment (the coin), e.g. "BTC-CHAIN" -> "BTC", "LBTC-CHAIN" -> "LBTC". */
function coinToken(id: string): string {
  return id.split('-')[0] ?? '';
}

/** Rail from the identifier's sub-token(s). */
function railToken(id: string): 'lightning' | 'onchain' | null {
  const parts = id.split('-').slice(1);
  if (parts.length === 0) return null; // bare coin code, e.g. "BTC"
  const sub = parts.join('-');
  if (sub === 'LN' || sub.startsWith('LIGHTNING')) return 'lightning';
  if (sub === 'CHAIN' || sub === 'ONCHAIN') return 'onchain';
  return null;
}

/** Maps a coin token to its settlement asset. Exact token match — never substring. */
function assetFromCoin(coin: string): PaymentAsset | null {
  if (coin === 'BTC' || coin === 'XBT') return 'BTC';
  if (coin === 'LBTC' || coin === 'L-BTC' || coin === 'LIQUID') return 'L-BTC';
  return null;
}

function normalizeToken(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().toUpperCase();
  return trimmed === '' ? null : trimmed;
}

// ---------------------------------------------------------------------------
// Exact crypto-amount arithmetic (8 decimals, BigInt — never floating point).
// Used to aggregate same-asset payment amounts without rounding error.
// ---------------------------------------------------------------------------

const CRYPTO_DECIMALS = 8;

/** Parses a decimal crypto amount string to integer base units (sats), or null. */
export function cryptoAmountToBaseUnits(amount: string): bigint | null {
  if (typeof amount !== 'string') return null;
  const trimmed = amount.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return null;
  const [intPart, fracRaw = ''] = trimmed.split('.');
  const frac = (fracRaw + '0'.repeat(CRYPTO_DECIMALS)).slice(0, CRYPTO_DECIMALS);
  try {
    return BigInt(intPart) * 10n ** BigInt(CRYPTO_DECIMALS) + BigInt(frac);
  } catch {
    return null;
  }
}

/** Formats integer base units (sats) back to a decimal string, trailing zeros trimmed. */
export function baseUnitsToCryptoAmount(units: bigint): string {
  const scale = 10n ** BigInt(CRYPTO_DECIMALS);
  const intPart = units / scale;
  const frac = (units % scale).toString().padStart(CRYPTO_DECIMALS, '0').replace(/0+$/, '');
  return frac ? `${intPart}.${frac}` : `${intPart}`;
}

/** Sums same-asset crypto amount strings exactly. Returns null if any is invalid. */
export function sumCryptoAmounts(amounts: string[]): string | null {
  let total = 0n;
  for (const a of amounts) {
    const units = cryptoAmountToBaseUnits(a);
    if (units == null) return null;
    total += units;
  }
  return baseUnitsToCryptoAmount(total);
}
