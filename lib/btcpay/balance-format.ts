// Shared, precise formatting for on-chain Bitcoin balances + fiat conversion.
//
// All amounts flow through here so BTC/fiat rendering is consistent everywhere
// and never loses satoshi precision. Balances arrive from the backend as exact
// integer satoshis; fiat is derived from those integers and a decimal rate
// string using BigInt math (never floating point) before display formatting.

/** A decimal string parsed into an integer mantissa + its decimal scale. */
interface ScaledDecimal {
  mantissa: bigint;
  scale: number;
}

function parseDecimal(value: string): ScaledDecimal | null {
  const m = /^(-?)(\d*)(?:\.(\d+))?$/.exec((value ?? '').trim());
  if (!m || (!m[2] && !m[3])) return null;
  const sign = m[1] === '-' ? -1n : 1n;
  const whole = m[2] || '0';
  const frac = m[3] || '';
  return { mantissa: sign * BigInt(whole + frac), scale: frac.length };
}

/**
 * Formats integer satoshis as a BTC amount string (no unit), up to 8 decimals
 * with trailing zeros trimmed. Exact — uses BigInt, never a float.
 *   0        -> "0"
 *   12_500   -> "0.000125"
 *   125_000_000 -> "1.25"
 * A tiny nonzero balance is never rounded down to "0".
 */
export function formatBtcFromSats(sats: number): string {
  const value = BigInt(Math.trunc(Number.isFinite(sats) ? sats : 0));
  const neg = value < 0n;
  const abs = neg ? -value : value;
  const whole = abs / 100_000_000n;
  const frac = (abs % 100_000_000n).toString().padStart(8, '0').replace(/0+$/, '');
  const text = frac ? `${whole}.${frac}` : `${whole}`;
  return neg ? `-${text}` : text;
}

/** Prefixes a BTC amount with the ₿ symbol, e.g. "₿0.000125". */
export function formatBtcSymbol(sats: number): string {
  return `₿${formatBtcFromSats(sats)}`;
}

/**
 * Computes the fiat value (in major units, e.g. dollars) of `sats` at a given
 * BTC->fiat `rate` (decimal string). Returns null when the rate is unusable.
 * Uses BigInt throughout so `sats * rate` never overflows float precision; only
 * the final, already-rounded 2-decimal result is converted to a Number.
 */
export function computeFiatValue(sats: number, rate: string | null | undefined): number | null {
  if (rate == null || !Number.isFinite(sats)) return null;
  const parsed = parseDecimal(rate);
  if (!parsed || parsed.mantissa <= 0n) return null;

  const MINOR = 2; // compute to cents, then round half-up
  const satsInt = BigInt(Math.round(sats));
  // fiatMinor = sats/1e8 * (mantissa/10^scale) * 10^MINOR, rounded.
  const numerator = satsInt * parsed.mantissa * 10n ** BigInt(MINOR);
  const denominator = 10n ** BigInt(8 + parsed.scale);
  if (denominator === 0n) return null;
  const neg = numerator < 0n;
  const absNum = neg ? -numerator : numerator;
  const rounded = (absNum + denominator / 2n) / denominator; // round half up
  const minor = neg ? -rounded : rounded;
  return Number(minor) / 10 ** MINOR;
}

/**
 * Formats a fiat value for `currency` using en-US grouping, e.g. "$1,234.56".
 * Returns null when the balance can't be priced (caller shows a "—" placeholder
 * rather than a misleading "$0.00").
 */
export function formatFiat(
  sats: number,
  rate: string | null | undefined,
  currency: string,
): string | null {
  const value = computeFiatValue(sats, rate);
  if (value == null) return null;
  try {
    return value.toLocaleString('en-US', { style: 'currency', currency });
  } catch {
    // Unknown currency code — fall back to a plain 2-decimal + code.
    return `${value.toFixed(2)} ${currency}`;
  }
}
