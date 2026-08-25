// Server-side validation for merchant-supplied Payment Request input.
//
// Same trust model as invoice-input.ts: the client's checks are a UX affordance,
// never a boundary — a forged request that skips the app must hit exactly these
// rules. Amount/currency/email/idempotency validation is REUSED from
// invoice-input.ts; this module adds only the fields specific to payment
// requests, mapped to the DEPLOYED server's PaymentRequestBaseData schema
// (verified 2026-08-24 — see the payment-request section of btcpay-client.ts).

export type PaymentRequestInputErrorCode =
  | 'INVALID_REQUEST'
  | 'INVALID_EXPIRATION'
  | 'INVALID_CUSTOMER_DATA_OPTION';

export interface PaymentRequestInputError {
  code: PaymentRequestInputErrorCode;
  message: string;
}

export type PrValidated<T> =
  | { ok: true; value: T }
  | ({ ok: false } & PaymentRequestInputError);

function fail(
  code: PaymentRequestInputErrorCode,
  message: string,
): { ok: false } & PaymentRequestInputError {
  return { ok: false, code, message };
}

export const MAX_TITLE_LENGTH = 200;
export const MAX_MEMO_LENGTH = 500; // Mirrors the MemoField UI cap.
export const MAX_REFERENCE_ID_LENGTH = 100;

/** Required, trimmed, length-capped title. BTCPay requires one and so does the UI. */
export function validateTitle(raw: unknown): PrValidated<string> {
  if (typeof raw !== 'string' || !raw.trim()) {
    return fail('INVALID_REQUEST', 'Title is required.');
  }
  const trimmed = raw.trim();
  if (trimmed.length > MAX_TITLE_LENGTH) {
    return fail('INVALID_REQUEST', `Title must be ${MAX_TITLE_LENGTH} characters or fewer.`);
  }
  return { ok: true, value: trimmed };
}

// ---------------------------------------------------------------------------
// Expiration
// ---------------------------------------------------------------------------
//
// The UI offers: no expiration / 24h / 7d / 30d. The wire format is whole HOURS
// (null = never expires) so adding options later needs no server change. BTCPay's
// PaymentRequestBaseData.expiryDate is a nullable unix timestamp — the server
// computes it from these hours at creation time.

export const MIN_EXPIRY_HOURS = 1;
export const MAX_EXPIRY_HOURS = 24 * 365; // One year — a sanity ceiling.

export function validateExpiresInHours(raw: unknown): PrValidated<number | null> {
  if (raw == null) return { ok: true, value: null };
  if (typeof raw !== 'number' || !Number.isInteger(raw)) {
    return fail('INVALID_EXPIRATION', 'Expiration must be a whole number of hours.');
  }
  if (raw < MIN_EXPIRY_HOURS || raw > MAX_EXPIRY_HOURS) {
    return fail(
      'INVALID_EXPIRATION',
      `Expiration must be between ${MIN_EXPIRY_HOURS} and ${MAX_EXPIRY_HOURS} hours.`,
    );
  }
  return { ok: true, value: raw };
}

// ---------------------------------------------------------------------------
// Customer data on checkout
// ---------------------------------------------------------------------------
//
// Maps the UI's selection to BTCPay's BUILT-IN form ids, both live-verified
// against the deployed server ("Email" and "Address" accepted). Arbitrary form
// ids from the client are rejected — Hachisu has no custom-forms feature.

export type CustomerDataOption = 'none' | 'email' | 'shipping';

const FORM_ID_BY_OPTION: Record<CustomerDataOption, string | null> = {
  none: null,
  email: 'Email',
  shipping: 'Address',
};

export function validateCustomerDataOption(
  raw: unknown,
): PrValidated<{ option: CustomerDataOption; formId: string | null }> {
  const option = raw == null ? 'none' : raw;
  if (option !== 'none' && option !== 'email' && option !== 'shipping') {
    return fail('INVALID_CUSTOMER_DATA_OPTION', 'Select a valid customer data option.');
  }
  return { ok: true, value: { option, formId: FORM_ID_BY_OPTION[option] } };
}

/** Reverses the mapping for records read back from BTCPay. Unknown/custom form
 * ids (authored outside Hachisu) surface as 'none' rather than being guessed. */
export function customerDataOptionForFormId(formId: unknown): CustomerDataOption {
  if (formId === 'Email') return 'email';
  if (formId === 'Address') return 'shipping';
  return 'none';
}
