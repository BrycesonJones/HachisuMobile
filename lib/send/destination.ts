// Bitcoin send-destination parsing and validation.
//
// Accepts raw Bitcoin addresses and BIP21 payment URIs (from the QR scanner or
// the clipboard), validates them fully client-side — bech32/bech32m checksums
// per BIP173/BIP350 and base58check per the original address format — and
// normalizes them into a SendDestination. The backend re-validates the
// destination authoritatively before any PSBT is created; this module exists so
// the scanner can give an immediate, accurate accept/reject.
//
// Lightning payloads (bolt11 invoices, LNURL, lightning: URIs) are RECOGNIZED
// so we can show a useful "not supported yet" message, but never accepted —
// extending `classifyPayload` is the intended seam for Lightning send later.

import { sha256 } from '@/lib/send/sha256';

/** The Bitcoin network our BTCPay deployment runs on. Send is mainnet-only. */
export const SEND_NETWORK = 'mainnet' as const;

export type BitcoinNetwork = 'mainnet' | 'testnet' | 'regtest';

export interface SendDestination {
  /** Validated address, bech32 normalized to lowercase. */
  address: string;
  /** Amount requested by a BIP21 URI, in integer satoshis, or null. */
  amountSats: number | null;
  /** Optional BIP21 label (already URI-decoded). */
  label: string | null;
  /** The original BIP21 URI when the payload was one, else null. */
  bip21Uri: string | null;
}

export type ParseDestinationErrorCode =
  | 'EMPTY'
  | 'LIGHTNING_UNSUPPORTED'
  | 'WRONG_NETWORK'
  | 'INVALID_ADDRESS'
  | 'INVALID_BIP21'
  | 'UNRECOGNIZED';

export type ParseDestinationResult =
  | { ok: true; destination: SendDestination }
  | { ok: false; code: ParseDestinationErrorCode; message: string };

const MAX_SATS = 21_000_000n * 100_000_000n;

// ---------------------------------------------------------------------------
// bech32 / bech32m (BIP173 / BIP350)
// ---------------------------------------------------------------------------

const BECH32_CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
const BECH32M_CONST = 0x2bc830a3;

function bech32Polymod(values: number[]): number {
  const GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
  let chk = 1;
  for (const v of values) {
    const b = chk >>> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ v;
    for (let i = 0; i < 5; i++) {
      if ((b >>> i) & 1) chk ^= GEN[i];
    }
  }
  return chk >>> 0;
}

function bech32HrpExpand(hrp: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < hrp.length; i++) out.push(hrp.charCodeAt(i) >> 5);
  out.push(0);
  for (let i = 0; i < hrp.length; i++) out.push(hrp.charCodeAt(i) & 31);
  return out;
}

interface Bech32Decoded {
  hrp: string;
  data: number[];
  encoding: 'bech32' | 'bech32m';
}

function bech32Decode(input: string): Bech32Decoded | null {
  if (input.length < 8 || input.length > 90) return null;
  const hasLower = /[a-z]/.test(input);
  const hasUpper = /[A-Z]/.test(input);
  if (hasLower && hasUpper) return null; // Mixed case is invalid per BIP173.
  const s = input.toLowerCase();
  const sep = s.lastIndexOf('1');
  if (sep < 1 || sep + 7 > s.length) return null;
  const hrp = s.slice(0, sep);
  for (let i = 0; i < hrp.length; i++) {
    const c = hrp.charCodeAt(i);
    if (c < 33 || c > 126) return null;
  }
  const data: number[] = [];
  for (const ch of s.slice(sep + 1)) {
    const v = BECH32_CHARSET.indexOf(ch);
    if (v === -1) return null;
    data.push(v);
  }
  const check = bech32Polymod([...bech32HrpExpand(hrp), ...data]);
  if (check === 1) return { hrp, data: data.slice(0, -6), encoding: 'bech32' };
  if (check === BECH32M_CONST) {
    return { hrp, data: data.slice(0, -6), encoding: 'bech32m' };
  }
  return null;
}

/** Strict 5-bit → 8-bit regroup (no padding allowed), per BIP173. */
function convertBits5to8(data: number[]): number[] | null {
  let acc = 0;
  let bits = 0;
  const out: number[] = [];
  for (const v of data) {
    acc = (acc << 5) | v;
    bits += 5;
    while (bits >= 8) {
      bits -= 8;
      out.push((acc >> bits) & 0xff);
    }
  }
  if (bits >= 5 || (acc << (8 - bits)) & 0xff) return null;
  return out;
}

function classifySegwitAddress(input: string): BitcoinNetwork | null {
  const decoded = bech32Decode(input);
  if (!decoded || decoded.data.length === 0) return null;
  const network: BitcoinNetwork | null =
    decoded.hrp === 'bc' ? 'mainnet'
    : decoded.hrp === 'tb' ? 'testnet'
    : decoded.hrp === 'bcrt' ? 'regtest'
    : null;
  if (!network) return null;
  const version = decoded.data[0];
  if (version > 16) return null;
  const program = convertBits5to8(decoded.data.slice(1));
  if (!program || program.length < 2 || program.length > 40) return null;
  if (version === 0) {
    if (decoded.encoding !== 'bech32') return null;
    if (program.length !== 20 && program.length !== 32) return null;
  } else if (decoded.encoding !== 'bech32m') {
    return null;
  }
  return network;
}

// ---------------------------------------------------------------------------
// base58check (legacy P2PKH / P2SH)
// ---------------------------------------------------------------------------

const BASE58_ALPHABET =
  '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function base58Decode(input: string): Uint8Array | null {
  if (input.length === 0) return null;
  let acc = 0n;
  for (const ch of input) {
    const v = BASE58_ALPHABET.indexOf(ch);
    if (v === -1) return null;
    acc = acc * 58n + BigInt(v);
  }
  const bytes: number[] = [];
  while (acc > 0n) {
    bytes.unshift(Number(acc & 0xffn));
    acc >>= 8n;
  }
  // Each leading '1' encodes a leading zero byte.
  for (const ch of input) {
    if (ch !== '1') break;
    bytes.unshift(0);
  }
  return new Uint8Array(bytes);
}

function classifyBase58Address(input: string): BitcoinNetwork | null {
  // Legacy addresses are 26-35 chars; anything longer is some other payload.
  if (input.length < 26 || input.length > 35) return null;
  const decoded = base58Decode(input);
  if (!decoded || decoded.length !== 25) return null;
  const payload = decoded.slice(0, 21);
  const checksum = decoded.slice(21);
  const hash = sha256(sha256(payload));
  for (let i = 0; i < 4; i++) {
    if (hash[i] !== checksum[i]) return null;
  }
  const version = payload[0];
  if (version === 0x00 || version === 0x05) return 'mainnet';
  if (version === 0x6f || version === 0xc4) return 'testnet';
  return null;
}

/**
 * Returns the network a syntactically + checksum-valid Bitcoin address belongs
 * to, or null when the string is not a valid address at all.
 */
export function classifyBitcoinAddress(input: string): BitcoinNetwork | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();
  if (lower.startsWith('bc1') || lower.startsWith('tb1') || lower.startsWith('bcrt1')) {
    return classifySegwitAddress(trimmed);
  }
  return classifyBase58Address(trimmed);
}

/** Shortens an address for display: "bc1qw5...v8f3t4" style (start + end). */
export function formatShortAddress(address: string): string {
  const trimmed = address.trim();
  if (trimmed.length <= 16) return trimmed;
  return `${trimmed.slice(0, 6)}...${trimmed.slice(-6)}`;
}

// ---------------------------------------------------------------------------
// Amounts
// ---------------------------------------------------------------------------

/**
 * Parses a decimal BTC string ("0.001") into integer satoshis using BigInt —
 * never floating point. Returns null for malformed values, more than 8 decimal
 * places, zero, negatives, or amounts above 21M BTC.
 */
export function parseBtcAmountToSats(value: string): number | null {
  const m = /^(\d+)(?:\.(\d+))?$/.exec(value.trim());
  if (!m) return null;
  const frac = m[2] ?? '';
  if (frac.length > 8) return null;
  const sats = BigInt(m[1]) * 100_000_000n + BigInt(frac.padEnd(8, '0') || '0');
  if (sats <= 0n || sats > MAX_SATS) return null;
  return Number(sats);
}

// ---------------------------------------------------------------------------
// Payload classification (QR / clipboard)
// ---------------------------------------------------------------------------

function looksLikeLightning(lower: string): boolean {
  if (lower.startsWith('lightning:')) return true;
  // bolt11 invoices: lnbc/lntb/lnbcrt + amount/multiplier + bech32 data.
  if (/^ln(bc|tb|bcrt)[0-9a-z]{10,}$/.test(lower)) return true;
  if (lower.startsWith('lnurl1')) return true;
  return false;
}

function invalid(
  code: ParseDestinationErrorCode,
  message: string,
): ParseDestinationResult {
  return { ok: false, code, message };
}

function acceptAddress(
  raw: string,
  extras: { amountSats: number | null; label: string | null; bip21Uri: string | null },
): ParseDestinationResult {
  const network = classifyBitcoinAddress(raw);
  if (network === null) {
    return invalid('INVALID_ADDRESS', 'This is not a valid Bitcoin address.');
  }
  if (network !== SEND_NETWORK) {
    return invalid(
      'WRONG_NETWORK',
      'This address is for a different Bitcoin network and can’t receive funds here.',
    );
  }
  // bech32 is case-insensitive; normalize to lowercase. Base58 is case-sensitive
  // and must be kept exactly as scanned.
  const address = /^(bc1|tb1|bcrt1)/i.test(raw.trim())
    ? raw.trim().toLowerCase()
    : raw.trim();
  return { ok: true, destination: { address, ...extras } };
}

function parseBip21(uri: string): ParseDestinationResult {
  const rest = uri.slice('bitcoin:'.length);
  const qIndex = rest.indexOf('?');
  const addressPart = qIndex === -1 ? rest : rest.slice(0, qIndex);
  const queryPart = qIndex === -1 ? '' : rest.slice(qIndex + 1);

  let amountSats: number | null = null;
  let label: string | null = null;
  let hasLightningParam = false;

  if (queryPart) {
    for (const pair of queryPart.split('&')) {
      if (!pair) continue;
      const eq = pair.indexOf('=');
      const rawKey = eq === -1 ? pair : pair.slice(0, eq);
      const rawValue = eq === -1 ? '' : pair.slice(eq + 1);
      let key: string;
      let value: string;
      try {
        key = decodeURIComponent(rawKey).toLowerCase();
        value = decodeURIComponent(rawValue.replace(/\+/g, '%20'));
      } catch {
        return invalid('INVALID_BIP21', 'This payment link is malformed.');
      }

      if (key.startsWith('req-')) {
        // BIP21: a req- parameter we don't understand makes the whole URI one we
        // MUST NOT act on — ignoring it could change the payment's meaning.
        return invalid(
          'UNRECOGNIZED',
          'This payment link uses a feature Hachisu doesn’t support yet.',
        );
      }
      if (key === 'amount') {
        const sats = parseBtcAmountToSats(value);
        if (sats === null) {
          return invalid('INVALID_BIP21', 'This payment link has an invalid amount.');
        }
        amountSats = sats;
      } else if (key === 'label') {
        label = value || null;
      } else if (key === 'lightning') {
        hasLightningParam = true;
      }
      // Other optional params (message, pj, ...) are display/transport hints;
      // ignoring them does not change where or how much we pay on-chain.
    }
  }

  if (!addressPart) {
    // A unified QR with an empty on-chain part is effectively Lightning-only.
    if (hasLightningParam) {
      return invalid(
        'LIGHTNING_UNSUPPORTED',
        'This is a Lightning payment code. Hachisu can only send on-chain bitcoin right now.',
      );
    }
    return invalid('INVALID_BIP21', 'This payment link has no Bitcoin address.');
  }

  return acceptAddress(addressPart, { amountSats, label, bip21Uri: uri });
}

/**
 * Parses a scanned QR / pasted payload into a validated on-chain send
 * destination. Never throws — malformed input returns a typed error.
 */
export function parseSendDestination(payload: string): ParseDestinationResult {
  const trimmed = (payload ?? '').trim();
  if (!trimmed) return invalid('EMPTY', 'Nothing to read — the code was empty.');

  const lower = trimmed.toLowerCase();
  if (looksLikeLightning(lower)) {
    return invalid(
      'LIGHTNING_UNSUPPORTED',
      'This is a Lightning payment code. Hachisu can only send on-chain bitcoin right now.',
    );
  }
  if (lower.startsWith('bitcoin:')) {
    return parseBip21(trimmed);
  }
  const asAddress = acceptAddress(trimmed, {
    amountSats: null,
    label: null,
    bip21Uri: null,
  });
  if (asAddress.ok || asAddress.code !== 'INVALID_ADDRESS') return asAddress;
  // Keep "invalid address" for things that were clearly MEANT to be one (right
  // prefix, wrong content — e.g. a typo); everything else gets the generic copy.
  const looksAddressLike =
    /^(bc1|tb1|bcrt1)[0-9a-z]+$/i.test(trimmed) ||
    /^[123mn][1-9A-HJ-NP-Za-km-z]{20,}$/.test(trimmed);
  if (looksAddressLike) return asAddress;
  return invalid(
    'UNRECOGNIZED',
    'That doesn’t look like a Bitcoin address or payment link.',
  );
}
