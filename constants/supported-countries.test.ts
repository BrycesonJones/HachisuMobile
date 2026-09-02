// Regression tests for the Personal-account limited-country launch.
//
// The country selector on the pre-auth country/legal screen must offer
// exactly the launch countries, store the FULL canonical name (never an ISO
// code), and provide no free-text or "Other" escape hatch. The same list is
// enforced at signup finalization (lib/auth/personal-signup.ts), so a value
// outside it can never be persisted to user_profiles.country.
//
// Run: npm run test:app

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import {
  COUNTRY_PHONES,
  isSupportedCountry,
  isValidPhoneForCountry,
  normalizePhoneForCountry,
  phoneMetadataFor,
  SUPPORTED_COUNTRIES,
} from './supported-countries.ts';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

const LAUNCH_COUNTRIES = [
  'United States',
  'Canada',
  'United Kingdom',
  'Australia',
  'New Zealand',
  'Ireland',
  'Singapore',
  'Hong Kong',
];

const ISO_CODES = ['US', 'CA', 'GB', 'UK', 'AU', 'NZ', 'IE', 'SG', 'HK'];

test('the selector list contains exactly the 8 launch countries, as full names', () => {
  assert.deepEqual([...SUPPORTED_COUNTRIES], LAUNCH_COUNTRIES);
});

test('every launch country is accepted by full canonical name', () => {
  for (const name of LAUNCH_COUNTRIES) {
    assert.ok(isSupportedCountry(name), `${name} must be selectable and storable`);
  }
});

test('ISO-style codes are never valid stored values', () => {
  for (const code of ISO_CODES) {
    assert.ok(
      !isSupportedCountry(code),
      `"${code}" must not be storable — user_profiles.country holds the full name`,
    );
  }
});

test('arbitrary, unsupported, or free-text values are rejected', () => {
  for (const value of [
    'France',
    'Other',
    'united states', // exact canonical casing only — the selector controls the value
    ' United States ',
    '',
    null,
    undefined,
  ] as const) {
    assert.ok(!isSupportedCountry(value), `${JSON.stringify(value)} must be rejected`);
  }
});

// Source-level guards on the country screen: the field stays structured. The
// selector is fed by SUPPORTED_COUNTRIES and there is no text-input or
// "Other" path to smuggle in an arbitrary value.
test('the country screen offers only the structured launch-country selector', () => {
  const source = readFileSync(join(repoRoot, 'app/auth/personal-country.tsx'), 'utf8');

  assert.ok(
    source.includes('SUPPORTED_COUNTRIES'),
    'personal-country.tsx must feed the selector from SUPPORTED_COUNTRIES',
  );
  for (const forbidden of ['TextInput', 'LabeledTextInput', "'Other'", '"Other"']) {
    assert.ok(
      !source.includes(forbidden),
      `personal-country.tsx contains "${forbidden}" — the country field must stay ` +
        'a structured selector over the launch list, with no free-text or Other path',
    );
  }
});

// ---------------------------------------------------------------------------
// Country-aware phone metadata (flag / calling code / placeholder) and
// normalization. The selected country name — never the calling code — is the
// source of truth for presentation.
// ---------------------------------------------------------------------------

const EXPECTED_PHONE_METADATA: Record<
  string,
  { flag: string; callingCode: string; placeholder: string }
> = {
  'United States': { flag: '🇺🇸', callingCode: '+1', placeholder: '201-555-0123' },
  Canada: { flag: '🇨🇦', callingCode: '+1', placeholder: '416-555-0123' },
  'United Kingdom': { flag: '🇬🇧', callingCode: '+44', placeholder: '20 7946 0958' },
  Australia: { flag: '🇦🇺', callingCode: '+61', placeholder: '2 9374 4000' },
  'New Zealand': { flag: '🇳🇿', callingCode: '+64', placeholder: '21 123 4567' },
  Ireland: { flag: '🇮🇪', callingCode: '+353', placeholder: '85 123 4567' },
  Singapore: { flag: '🇸🇬', callingCode: '+65', placeholder: '8123 4567' },
  'Hong Kong': { flag: '🇭🇰', callingCode: '+852', placeholder: '5123 4567' },
};

test('every launch country has the expected flag, calling code, and placeholder', () => {
  assert.deepEqual(
    Object.keys(COUNTRY_PHONES).sort(),
    [...SUPPORTED_COUNTRIES].sort(),
    'phone metadata must cover exactly the launch countries',
  );

  for (const name of SUPPORTED_COUNTRIES) {
    const expected = EXPECTED_PHONE_METADATA[name];
    const actual = phoneMetadataFor(name);
    assert.ok(actual, `${name} must have phone metadata`);
    assert.equal(actual.flag, expected.flag, `${name} flag`);
    assert.equal(actual.callingCode, expected.callingCode, `${name} calling code`);
    assert.equal(actual.placeholder, expected.placeholder, `${name} placeholder`);
  }
});

test('Canada shows the Canadian flag, not the US flag, while sharing +1', () => {
  const canada = phoneMetadataFor('Canada');
  assert.ok(canada);
  assert.equal(canada.callingCode, '+1');
  assert.equal(canada.flag, '🇨🇦');
  assert.notEqual(canada.flag, '🇺🇸', 'the flag must come from the country, not the calling code');
});

test('an unsupported or missing country yields no phone metadata (no silent US default)', () => {
  for (const value of ['France', 'US', '', null, undefined] as const) {
    assert.equal(
      phoneMetadataFor(value),
      null,
      `${JSON.stringify(value)} must not resolve to any country's phone metadata`,
    );
  }
});

test('national input normalizes to E.164 for every launch country', () => {
  const cases: [string, string, string][] = [
    ['United States', '2015550123', '+12015550123'],
    ['Canada', '4165550123', '+14165550123'],
    ['United Kingdom', '2079460958', '+442079460958'],
    ['Australia', '293744000', '+61293744000'],
    ['New Zealand', '211234567', '+64211234567'],
    ['Ireland', '851234567', '+353851234567'],
    ['Singapore', '81234567', '+6581234567'],
    ['Hong Kong', '51234567', '+85251234567'],
  ];
  for (const [country, input, expected] of cases) {
    assert.equal(normalizePhoneForCountry(country, input), expected, `${country} ${input}`);
  }
});

test('formatting characters in the input are ignored', () => {
  assert.equal(normalizePhoneForCountry('Canada', '416-555-0123'), '+14165550123');
  assert.equal(normalizePhoneForCountry('United Kingdom', '20 7946 0958'), '+442079460958');
  assert.equal(normalizePhoneForCountry('Singapore', '8123 4567'), '+6581234567');
});

test('a national trunk 0 is dropped — never a malformed "+<code>0…" number', () => {
  const cases: [string, string, string][] = [
    ['United Kingdom', '02079460958', '+442079460958'],
    ['Australia', '0293744000', '+61293744000'],
    ['New Zealand', '0211234567', '+64211234567'],
    ['Ireland', '0851234567', '+353851234567'],
  ];
  for (const [country, input, expected] of cases) {
    const normalized = normalizePhoneForCountry(country, input);
    assert.equal(normalized, expected, `${country} ${input}`);
    const code = phoneMetadataFor(country)?.callingCode ?? '';
    assert.ok(
      !String(normalized).startsWith(`${code}0`),
      `${country} must not produce a ${code}0… number`,
    );
  }
});

test('an 11-digit NANP entry with the leading 1 written out is accepted', () => {
  assert.equal(normalizePhoneForCountry('United States', '12015550123'), '+12015550123');
  assert.equal(normalizePhoneForCountry('Canada', '14165550123'), '+14165550123');
});

test('input already in international form is accepted for the matching country only', () => {
  assert.equal(
    normalizePhoneForCountry('United Kingdom', '+44 20 7946 0958'),
    '+442079460958',
  );
  assert.equal(normalizePhoneForCountry('Canada', '+1 416-555-0123'), '+14165550123');
  // A +number from a different country must not be silently re-labeled.
  assert.equal(normalizePhoneForCountry('United Kingdom', '+61293744000'), null);
});

test('no U.S. 10-digit assumption: shorter supported-country numbers validate', () => {
  // Singapore and Hong Kong numbers are 8 digits — the old >=10-digit rule
  // would have rejected them outright.
  assert.ok(isValidPhoneForCountry('Singapore', '81234567'));
  assert.ok(isValidPhoneForCountry('Hong Kong', '51234567'));
  assert.ok(isValidPhoneForCountry('Ireland', '851234567'));
});

test('empty or incomplete input never validates', () => {
  assert.ok(!isValidPhoneForCountry('United States', ''));
  assert.ok(!isValidPhoneForCountry('United States', '201555'));
  assert.ok(!isValidPhoneForCountry('United States', '201555012')); // 9 digits
  assert.ok(!isValidPhoneForCountry('Singapore', '8123456')); // 7 digits
  assert.ok(!isValidPhoneForCountry('Canada', '   '));
  assert.ok(!isValidPhoneForCountry(undefined, '2015550123'));
  assert.ok(!isValidPhoneForCountry('France', '2015550123'));
});

test('the phone screen derives its UI from the carried country, with no US fallback', () => {
  const source = readFileSync(join(repoRoot, 'app/auth/personal-phone.tsx'), 'utf8');

  assert.ok(
    source.includes('phoneMetadataFor'),
    'personal-phone.tsx must derive flag/calling code/placeholder from the carried country',
  );
  assert.ok(
    !source.includes('🇺🇸'),
    'personal-phone.tsx must not hard-code the US flag',
  );
  assert.ok(
    !source.includes("placeholder=\"201-555-0123\"") && !source.includes("'201-555-0123'"),
    'personal-phone.tsx must not hard-code the US placeholder',
  );
  assert.ok(
    !source.includes('isValidPhone('),
    'personal-phone.tsx must use country-aware validation, not the legacy >=10-digit rule',
  );
});

test('the selector component itself has no free-text path', () => {
  const source = readFileSync(
    join(repoRoot, 'components/auth/country-selector-card.tsx'),
    'utf8',
  );
  assert.ok(
    !source.includes('TextInput'),
    'country-selector-card.tsx must not render a text input — selection only',
  );
});
