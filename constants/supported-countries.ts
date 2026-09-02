// The countries the Personal-account launch supports. Structured as a list so
// the selector UI never needs touching when the launch expands — mirroring
// SUPPORTED_CURRENCIES in constants/currencies.ts.
//
// The stored user_profiles.country value is the FULL canonical name exactly as
// listed here (e.g. "United States", never "US"): the column is free text with
// existing rows already holding "United States", and every reader
// (account/personal-profile, account/edit-name-address) displays the value
// verbatim. Keep these display-identical to what merchants should see.
//
// Deliberately free of React Native imports so the launch policy can be
// exercised directly in Node unit tests — see supported-countries.test.ts and
// lib/auth/personal-signup.ts, which enforces it at signup finalization.

export const SUPPORTED_COUNTRIES = [
  'United States',
  'Canada',
  'United Kingdom',
  'Australia',
  'New Zealand',
  'Ireland',
  'Singapore',
  'Hong Kong',
] as const;

export type SupportedCountry = (typeof SUPPORTED_COUNTRIES)[number];

/** True only for an exact, full canonical country name from the launch list. */
export function isSupportedCountry(
  value: string | null | undefined,
): value is SupportedCountry {
  return (
    typeof value === 'string' && (SUPPORTED_COUNTRIES as readonly string[]).includes(value)
  );
}

/**
 * Phone metadata for each launch country, keyed by the same canonical names —
 * the selected onboarding country (NOT the calling code) is the source of
 * truth, which is why Canada gets 🇨🇦 despite sharing +1 with the US.
 *
 * `placeholder` is a UI example in the national format; it carries no
 * validation meaning. `nationalDigits` is a deliberately conservative
 * length range for the national significant number (NSN) — length-only, no
 * per-prefix rules — so legitimate numbers are never rejected on U.S.-only
 * assumptions (e.g. Singapore's 8 digits). `trunkPrefix` is the national
 * dialing prefix (the leading 0 in UK/AU/NZ/IE local writing) that
 * international E.164 form drops.
 */
export interface CountryPhoneMetadata {
  flag: string;
  /** International calling code including the leading + (e.g. "+44"). */
  callingCode: string;
  /** Example number in national writing, for the input placeholder only. */
  placeholder: string;
  /** Inclusive NSN digit-count range accepted for this country. */
  nationalDigits: { min: number; max: number };
  /** National trunk prefix stripped during normalization, if the country has one. */
  trunkPrefix?: '0';
}

export const COUNTRY_PHONES: Record<SupportedCountry, CountryPhoneMetadata> = {
  'United States': {
    flag: '🇺🇸',
    callingCode: '+1',
    placeholder: '201-555-0123',
    nationalDigits: { min: 10, max: 10 },
  },
  Canada: {
    flag: '🇨🇦',
    callingCode: '+1',
    placeholder: '416-555-0123',
    nationalDigits: { min: 10, max: 10 },
  },
  'United Kingdom': {
    flag: '🇬🇧',
    callingCode: '+44',
    placeholder: '20 7946 0958',
    nationalDigits: { min: 9, max: 10 },
    trunkPrefix: '0',
  },
  Australia: {
    flag: '🇦🇺',
    callingCode: '+61',
    placeholder: '2 9374 4000',
    nationalDigits: { min: 9, max: 9 },
    trunkPrefix: '0',
  },
  'New Zealand': {
    flag: '🇳🇿',
    callingCode: '+64',
    placeholder: '21 123 4567',
    nationalDigits: { min: 8, max: 10 },
    trunkPrefix: '0',
  },
  Ireland: {
    flag: '🇮🇪',
    callingCode: '+353',
    placeholder: '85 123 4567',
    nationalDigits: { min: 7, max: 9 },
    trunkPrefix: '0',
  },
  Singapore: {
    flag: '🇸🇬',
    callingCode: '+65',
    placeholder: '8123 4567',
    nationalDigits: { min: 8, max: 8 },
  },
  'Hong Kong': {
    flag: '🇭🇰',
    callingCode: '+852',
    placeholder: '5123 4567',
    nationalDigits: { min: 8, max: 8 },
  },
};

/**
 * Phone metadata for a carried country value, or null when the value is not a
 * launch country. Callers must handle null explicitly — never fall back to a
 * United States default for unknown state.
 */
export function phoneMetadataFor(
  country: string | null | undefined,
): CountryPhoneMetadata | null {
  return isSupportedCountry(country) ? COUNTRY_PHONES[country] : null;
}

/**
 * Normalizes user phone input to E.164 (+<calling code><NSN>) for the given
 * launch country, or returns null when the input is not a plausible number
 * for it.
 *
 * Deliberately small, explicit rules rather than a phone library:
 *  1. Formatting characters (spaces, dashes, parentheses) are ignored.
 *  2. Input written in international form ("+44 …") must match the selected
 *     country's calling code, which is then removed.
 *  3. For trunk-prefix countries (UK/AU/NZ/IE) one leading 0 is dropped —
 *     "020 7946 0958" and "20 7946 0958" both become +4420…, never "+440…".
 *     An NSN can then no longer begin with 0, so a remaining leading 0 is
 *     rejected rather than silently producing a malformed number.
 *  4. NANP (+1): an 11-digit entry starting with 1 is unambiguously the
 *     country code written out (area codes never start with 1), so it is
 *     dropped.
 *  5. The remaining NSN must fall in the country's digit-count range.
 *     Validation is length-only by design (no area-code/prefix tables).
 */
export function normalizePhoneForCountry(
  country: string | null | undefined,
  input: string,
): string | null {
  const meta = phoneMetadataFor(country);
  if (!meta) return null;

  const trimmed = input.trim();
  let digits = trimmed.replace(/\D/g, '');
  const callingCodeDigits = meta.callingCode.slice(1);

  if (trimmed.startsWith('+')) {
    if (!digits.startsWith(callingCodeDigits)) return null;
    digits = digits.slice(callingCodeDigits.length);
  }

  let national = digits;

  if (meta.trunkPrefix && national.startsWith(meta.trunkPrefix)) {
    national = national.slice(1);
    if (national.startsWith('0')) return null;
  }

  if (
    callingCodeDigits === '1' &&
    national.length === 11 &&
    national.startsWith('1')
  ) {
    national = national.slice(1);
  }

  if (
    national.length < meta.nationalDigits.min ||
    national.length > meta.nationalDigits.max
  ) {
    return null;
  }

  return `${meta.callingCode}${national}`;
}

/** True when the input normalizes to a plausible number for the country. */
export function isValidPhoneForCountry(
  country: string | null | undefined,
  input: string,
): boolean {
  return normalizePhoneForCountry(country, input) !== null;
}
