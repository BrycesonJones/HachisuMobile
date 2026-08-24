// Server-side validation for merchant-supplied invoice input.
//
// Everything here re-validates what the client already checked — the client's
// validation is a UX affordance, never a trust boundary. A forged request that
// skips the app entirely must hit exactly these rules.
//
// Money is validated as a DECIMAL STRING with BigInt arithmetic. Never
// Number()/parseFloat: `0.1 + 0.2`-class error and the silent precision loss of
// large values have no place in a financial validation path. `Number('1e-30')`
// is finite and > 0, and `Number('0.0000000000000000001')` rounds to a nonzero
// float — both would pass a naive check and produce a nonsense invoice.

/** Normalized, non-sensitive failure codes shared with the mobile client. */
export type InvoiceInputErrorCode =
  | 'INVALID_REQUEST'
  | 'INVALID_AMOUNT'
  | 'INVALID_CURRENCY'
  | 'INVALID_BUYER_EMAIL'
  | 'INVALID_EXPIRATION';

export interface InvoiceInputError {
  code: InvoiceInputErrorCode;
  message: string;
}

export type Validated<T> = { ok: true; value: T } | { ok: false } & InvoiceInputError;

function fail(code: InvoiceInputErrorCode, message: string): { ok: false } & InvoiceInputError {
  return { ok: false, code, message };
}

// ---------------------------------------------------------------------------
// Amount
// ---------------------------------------------------------------------------

/** Max invoice decimals accepted. BTCPay rounds to the currency's divisibility. */
const MAX_AMOUNT_DECIMALS = 8;
/** Upper bound (exclusive) on the integer part — a sanity ceiling, not a policy. */
const MAX_AMOUNT_INTEGER_DIGITS = 12;

/**
 * Validates a decimal amount string and returns it NORMALIZED (no leading zeros,
 * no trailing fractional zeros, no sign, no exponent). Rejects 0, negatives,
 * NaN/Infinity, exponent notation and malformed decimals — all of which are
 * plain string-shape rejections here rather than float comparisons.
 */
export function validateAmount(raw: unknown): Validated<string> {
  if (typeof raw !== 'string') {
    return fail('INVALID_AMOUNT', 'Enter an amount greater than zero.');
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    return fail('INVALID_AMOUNT', 'Enter an amount greater than zero.');
  }
  // Strict decimal shape only: digits, optional single dot, at least one digit on
  // the left. This alone rejects "NaN", "Infinity", "1e5", "-1", "1.2.3", "0x1".
  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    return fail('INVALID_AMOUNT', 'Enter a valid amount, for example 12.50.');
  }

  const [intPart, fracPart = ''] = trimmed.split('.');
  if (fracPart.length > MAX_AMOUNT_DECIMALS) {
    return fail(
      'INVALID_AMOUNT',
      `Use at most ${MAX_AMOUNT_DECIMALS} decimal places.`,
    );
  }
  const intTrimmed = intPart.replace(/^0+/, '');
  if (intTrimmed.length > MAX_AMOUNT_INTEGER_DIGITS) {
    return fail('INVALID_AMOUNT', 'That amount is too large.');
  }

  // Positivity via BigInt on the scaled integer — exact at any magnitude.
  const scaled =
    BigInt(intPart) * 10n ** BigInt(MAX_AMOUNT_DECIMALS) +
    BigInt((fracPart + '0'.repeat(MAX_AMOUNT_DECIMALS)).slice(0, MAX_AMOUNT_DECIMALS));
  if (scaled <= 0n) {
    return fail('INVALID_AMOUNT', 'Enter an amount greater than zero.');
  }

  const normalizedFrac = fracPart.replace(/0+$/, '');
  const normalized = `${intTrimmed || '0'}${normalizedFrac ? `.${normalizedFrac}` : ''}`;
  return { ok: true, value: normalized };
}

// ---------------------------------------------------------------------------
// Currency
// ---------------------------------------------------------------------------

/** Backend allow-list. Mirrors create-btcpay-store's list so a store's currency
 * is always creatable as an invoice currency. */
export const SUPPORTED_INVOICE_CURRENCIES = new Set([
  'USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'CHF', 'CNY', 'INR', 'BRL',
  'MXN', 'NGN', 'ZAR', 'SGD', 'HKD', 'NZD', 'SEK', 'NOK', 'DKK', 'PLN',
]);

/**
 * Resolves the invoice currency. An absent/empty client value falls back to the
 * STORE's configured currency (server-side) rather than to a hardcoded default,
 * so an omitted field can never silently re-denominate an invoice.
 */
export function validateCurrency(raw: unknown, storeCurrency: string): Validated<string> {
  const fallback = storeCurrency.trim().toUpperCase();
  if (raw == null || (typeof raw === 'string' && raw.trim() === '')) {
    if (!fallback) return fail('INVALID_CURRENCY', 'This store has no currency configured.');
    return { ok: true, value: fallback };
  }
  if (typeof raw !== 'string') {
    return fail('INVALID_CURRENCY', 'Select a valid currency.');
  }
  const code = raw.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(code) || !SUPPORTED_INVOICE_CURRENCIES.has(code)) {
    return fail('INVALID_CURRENCY', 'That currency is not supported.');
  }
  return { ok: true, value: code };
}

// ---------------------------------------------------------------------------
// Free text
// ---------------------------------------------------------------------------

export const MAX_DESCRIPTION_LENGTH = 500;
export const MAX_ORDER_ID_LENGTH = 100;

/** Trims and length-caps optional free text. Empty -> null (never an empty string,
 * so BTCPay metadata stays absent rather than blank). */
export function validateOptionalText(
  raw: unknown,
  maxLength: number,
  label: string,
): Validated<string | null> {
  if (raw == null) return { ok: true, value: null };
  if (typeof raw !== 'string') return fail('INVALID_REQUEST', `${label} is invalid.`);
  const trimmed = raw.trim();
  if (!trimmed) return { ok: true, value: null };
  if (trimmed.length > maxLength) {
    return fail('INVALID_REQUEST', `${label} must be ${maxLength} characters or fewer.`);
  }
  return { ok: true, value: trimmed };
}

// ---------------------------------------------------------------------------
// Email
// ---------------------------------------------------------------------------

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MAX_EMAIL_LENGTH = 254; // RFC 5321 practical maximum.

/** Optional buyer email. Structure check only — deliverability is not asserted. */
export function validateOptionalEmail(raw: unknown, label: string): Validated<string | null> {
  if (raw == null) return { ok: true, value: null };
  if (typeof raw !== 'string') return fail('INVALID_BUYER_EMAIL', `Enter a valid ${label}.`);
  const trimmed = raw.trim();
  if (!trimmed) return { ok: true, value: null };
  if (trimmed.length > MAX_EMAIL_LENGTH || !EMAIL_RE.test(trimmed)) {
    return fail('INVALID_BUYER_EMAIL', `Enter a valid ${label}.`);
  }
  return { ok: true, value: trimmed };
}

// ---------------------------------------------------------------------------
// Expiration
// ---------------------------------------------------------------------------

/** BTCPay's CheckoutOptions.expirationMinutes is a whole number of MINUTES
 * (verified against the deployed 2.4.3 OpenAPI: TimeSpanMinutes). Omitting it
 * makes BTCPay apply the store's configured default (15 minutes by default). */
export const MIN_EXPIRATION_MINUTES = 1;
export const MAX_EXPIRATION_MINUTES = 43_200; // 30 days.

/**
 * Optional expiration in minutes. The Create Invoice screen has no expiration
 * control today, so the client sends nothing and BTCPay's store default governs
 * — which keeps the app and the BTCPay checkout in agreement by construction.
 * The field is accepted here so adding the UI control later needs no server change.
 */
export function validateExpirationMinutes(raw: unknown): Validated<number | null> {
  if (raw == null) return { ok: true, value: null };
  if (typeof raw !== 'number' || !Number.isInteger(raw)) {
    return fail('INVALID_EXPIRATION', 'Expiration must be a whole number of minutes.');
  }
  if (raw < MIN_EXPIRATION_MINUTES || raw > MAX_EXPIRATION_MINUTES) {
    return fail(
      'INVALID_EXPIRATION',
      `Expiration must be between ${MIN_EXPIRATION_MINUTES} and ${MAX_EXPIRATION_MINUTES} minutes.`,
    );
  }
  return { ok: true, value: raw };
}

// ---------------------------------------------------------------------------
// Idempotency key
// ---------------------------------------------------------------------------

/** Accepts an opaque client token of a safe shape/length (a UUID in practice).
 * Never used as a secret — it only scopes a per-(store, attempt) unique row. */
export function validateIdempotencyKey(raw: unknown): Validated<string> {
  if (typeof raw !== 'string') {
    return fail('INVALID_REQUEST', 'idempotencyKey is required.');
  }
  const trimmed = raw.trim();
  if (trimmed.length < 8 || trimmed.length > 100 || !/^[A-Za-z0-9_-]+$/.test(trimmed)) {
    return fail('INVALID_REQUEST', 'idempotencyKey is malformed.');
  }
  return { ok: true, value: trimmed };
}
