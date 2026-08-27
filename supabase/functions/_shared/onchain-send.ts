// Shared helpers for the on-chain Bitcoin SEND flow.
//
// Everything here is pure transaction-data work: mapping the app's three
// network-speed options to confirmation block targets, authoritative mainnet
// address validation, decoding BTCPay's unsigned PSBT to derive the EXACT fee
// and outputs shown on the review screen, and verifying that a merchant-signed
// payload pays exactly what was reviewed before we broadcast it.
//
// bitcoinjs-lib is used for parsing only — no ecc backend is loaded, so this
// module is physically incapable of signing anything. Private keys never exist
// on this side of the flow.

import * as bitcoin from 'npm:bitcoinjs-lib@6.1.7';
import { Buffer } from 'node:buffer';

const NETWORK = bitcoin.networks.bitcoin;

/** The app's three network-speed options, mapped to confirmation targets. */
export const SEND_SPEEDS = {
  fast: { blockTarget: 1, approx: '~10 minutes' },
  standard: { blockTarget: 6, approx: '~1 hour' },
  economy: { blockTarget: 72, approx: '~6–24 hours' },
} as const;

export type SendSpeed = keyof typeof SEND_SPEEDS;

export function isSendSpeed(value: unknown): value is SendSpeed {
  return value === 'fast' || value === 'standard' || value === 'economy';
}

/** True when `address` is a valid MAINNET Bitcoin address of any type. */
export function isValidMainnetAddress(address: string): boolean {
  try {
    bitcoin.address.toOutputScript(address, NETWORK);
    return true;
  } catch {
    return false;
  }
}

export interface DecodedPsbtOutput {
  /** Rendered address, or null for a non-standard script. */
  address: string | null;
  /** Output script as lowercase hex (stable comparison key). */
  scriptHex: string;
  valueSats: bigint;
}

export interface DecodedPsbtSummary {
  inputCount: number;
  inputTotalSats: bigint;
  outputTotalSats: bigint;
  feeSats: bigint;
  outputs: DecodedPsbtOutput[];
}

export class PsbtDecodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PsbtDecodeError';
  }
}

/**
 * Decodes a base64 PSBT and computes the authoritative fee (sum of input UTXO
 * values minus sum of outputs). Throws PsbtDecodeError when the PSBT can't be
 * parsed or an input carries no UTXO information (BTCPay always includes
 * witnessUtxo and/or nonWitnessUtxo for wallet-owned inputs).
 */
export function decodePsbt(psbtBase64: string): DecodedPsbtSummary {
  let psbt: bitcoin.Psbt;
  try {
    psbt = bitcoin.Psbt.fromBase64(psbtBase64, { network: NETWORK });
  } catch {
    throw new PsbtDecodeError('The PSBT could not be parsed.');
  }

  let inputTotalSats = 0n;
  for (let i = 0; i < psbt.txInputs.length; i++) {
    const input = psbt.data.inputs[i];
    if (input.witnessUtxo) {
      inputTotalSats += BigInt(input.witnessUtxo.value);
    } else if (input.nonWitnessUtxo) {
      let prevTx: bitcoin.Transaction;
      try {
        prevTx = bitcoin.Transaction.fromBuffer(Buffer.from(input.nonWitnessUtxo));
      } catch {
        throw new PsbtDecodeError(`Input ${i} has an unreadable previous transaction.`);
      }
      const prevOut = prevTx.outs[psbt.txInputs[i].index];
      if (!prevOut) {
        throw new PsbtDecodeError(`Input ${i} references a missing previous output.`);
      }
      inputTotalSats += BigInt(prevOut.value);
    } else {
      throw new PsbtDecodeError(`Input ${i} carries no UTXO information.`);
    }
  }

  const outputs: DecodedPsbtOutput[] = psbt.txOutputs.map((out) => {
    let address: string | null = null;
    try {
      address = bitcoin.address.fromOutputScript(out.script, NETWORK);
    } catch {
      // Non-standard script — keep the hex, render no address.
    }
    return {
      address,
      scriptHex: Buffer.from(out.script).toString('hex'),
      valueSats: BigInt(out.value),
    };
  });

  const outputTotalSats = outputs.reduce((acc, o) => acc + o.valueSats, 0n);
  const feeSats = inputTotalSats - outputTotalSats;
  if (feeSats < 0n) {
    throw new PsbtDecodeError('The PSBT outputs exceed its inputs.');
  }

  return {
    inputCount: psbt.txInputs.length,
    inputTotalSats,
    outputTotalSats,
    feeSats,
    outputs,
  };
}

/**
 * Parses a merchant-signed payload — a signed PSBT (base64) or a raw signed
 * transaction (hex) — and returns its outputs for comparison against the
 * prepared send. Returns null when the payload is neither. Signature validity
 * itself is NOT checked here; BTCPay finalizes/validates on broadcast and the
 * Bitcoin network is the final arbiter. This check only pins WHAT is paid.
 */
export function decodeSignedPayloadOutputs(
  payload: string,
): { scriptHex: string; valueSats: bigint }[] | null {
  const trimmed = payload.trim();
  try {
    const psbt = bitcoin.Psbt.fromBase64(trimmed, { network: NETWORK });
    return psbt.txOutputs.map((o) => ({
      scriptHex: Buffer.from(o.script).toString('hex'),
      valueSats: BigInt(o.value),
    }));
  } catch {
    // Not a PSBT — try raw transaction hex.
  }
  try {
    const tx = bitcoin.Transaction.fromHex(trimmed);
    return tx.outs.map((o) => ({
      scriptHex: Buffer.from(o.script).toString('hex'),
      valueSats: BigInt(o.value),
    }));
  } catch {
    return null;
  }
}

/** The persisted, key-material-free description of one prepared output. */
export interface StoredOutputSummary {
  script: string;
  valueSats: string;
  address: string | null;
}

/** Serializes decoded outputs into the jsonb shape stored on the send row. */
export function toOutputSummary(outputs: DecodedPsbtOutput[]): StoredOutputSummary[] {
  return outputs.map((o) => ({
    script: o.scriptHex,
    valueSats: o.valueSats.toString(),
    address: o.address,
  }));
}

/** Parses a stored output summary back into comparison form. Null if mangled. */
export function fromOutputSummary(
  raw: unknown,
): { scriptHex: string; valueSats: bigint }[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const outputs: { scriptHex: string; valueSats: bigint }[] = [];
  for (const item of raw) {
    const script = (item as { script?: unknown })?.script;
    const valueSats = (item as { valueSats?: unknown })?.valueSats;
    if (typeof script !== 'string' || !/^[0-9a-f]+$/.test(script)) return null;
    if (typeof valueSats !== 'string' || !/^\d+$/.test(valueSats)) return null;
    outputs.push({ scriptHex: script, valueSats: BigInt(valueSats) });
  }
  return outputs;
}

/**
 * Derives the network txid from a merchant-signed payload BEFORE submission,
 * so an uncertain broadcast outcome can be reconciled deterministically (look
 * the txid up in the wallet's transaction list). For a signed PSBT this
 * finalizes a throwaway copy and extracts the transaction; for raw hex it
 * parses directly. Returns null when the payload can't be finalized — the
 * broadcast then proceeds anyway and BTCPay reports the authoritative txid.
 */
export function extractTxidFromSignedPayload(payload: string): string | null {
  const trimmed = payload.trim();
  try {
    const psbt = bitcoin.Psbt.fromBase64(trimmed, { network: NETWORK });
    psbt.finalizeAllInputs();
    // disableFeeCheck: economics were already pinned by the output-set check.
    return psbt.extractTransaction(true).getId();
  } catch {
    // Not a finalizable PSBT — try raw transaction hex.
  }
  try {
    return bitcoin.Transaction.fromHex(trimmed).getId();
  } catch {
    return null;
  }
}

/** sha256 (hex) of the unsigned PSBT base64 — stored for correlation only. */
export async function hashPsbt(psbtBase64: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(psbtBase64),
  );
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * True when the signed payload's outputs are EXACTLY the prepared PSBT's
 * outputs (same multiset of script+value). This is what stops a tampered or
 * unrelated transaction from being broadcast under a reviewed send — the
 * destination, amount, change script, and implied fee are all pinned.
 */
export function signedOutputsMatch(
  prepared: { scriptHex: string; valueSats: bigint }[],
  signed: { scriptHex: string; valueSats: bigint }[],
): boolean {
  if (prepared.length !== signed.length) return false;
  const key = (o: { scriptHex: string; valueSats: bigint }) =>
    `${o.scriptHex}:${o.valueSats}`;
  const remaining = new Map<string, number>();
  for (const o of prepared) {
    const k = key(o);
    remaining.set(k, (remaining.get(k) ?? 0) + 1);
  }
  for (const o of signed) {
    const k = key(o);
    const count = remaining.get(k);
    if (!count) return false;
    if (count === 1) remaining.delete(k);
    else remaining.set(k, count - 1);
  }
  return remaining.size === 0;
}
