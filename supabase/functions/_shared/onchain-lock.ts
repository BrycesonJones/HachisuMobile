// The on-chain (Bitcoin) payment-destination operation lock.
//
// Four endpoints mutate the SAME thing — the store's BTCPay on-chain payment
// method, and the merchant_stores columns that mirror it:
//
//   connect-btcpay-onchain-wallet   (first wallet)
//   replace-btcpay-onchain-wallet   (staged replacement)
//   remove-btcpay-onchain-wallet    (disconnect)
//   sync-btcpay-onchain-wallet      (re-read BTCPay, rewrite the mirror)
//
// Each one is individually correct: it authenticates, proves store ownership,
// calls BTCPay, and reads back before it believes anything. What none of them
// can do alone is establish that no OTHER one is running. Without mutual
// exclusion the endpoints interleave, and the mirror can end up describing a
// wallet BTCPay no longer has — or, worse, reporting "no wallet connected"
// while BTCPay routes real payments to one. A merchant reading that dashboard
// makes payment decisions on it.
//
// So the lock is a property of the resource, not of one workflow. Every mutating
// endpoint takes it here, through the same predicate, and none may clear a lock
// it does not own.
//
// Design notes:
//   * The lock lives in onchain_operation, kept SEPARATE from onchain_status, so
//     an in-flight operation never flips a working wallet into a transient state.
//   * Acquisition is a single conditional UPDATE — the database decides the
//     winner, not the application.
//   * A lock older than LOCK_STALE_MS may be superseded, so a crashed or
//     abandoned request can never wedge a merchant out of their own wallet
//     settings. The window deliberately exceeds the platform's maximum Edge
//     Function wall-clock runtime, which guarantees any request still holding a
//     lock that old was killed long ago and can no longer write.
//   * Every acquisition stamps a unique TOKEN. Writes and releases are
//     conditional on it, so if a later operation did supersede this one, the
//     earlier one can no longer commit or clobber the newer lock.

import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2.112.4';

import { jsonResponse } from './cors.ts';

/** Operations that may hold the lock. Mirrors the DB check constraint. */
export type OnchainOperation = 'connecting' | 'replacing' | 'removing';

/**
 * See the note above: this MUST exceed the platform's hard maximum Edge Function
 * runtime, so supersession can never overlap a still-running operation.
 */
export const LOCK_STALE_MS = 15 * 60 * 1000;

/** Thrown when a request no longer owns the lock it acquired (superseded). */
export class OnchainLockLost extends Error {
  constructor() {
    super('On-chain operation lock ownership lost.');
    this.name = 'OnchainLockLost';
  }
}

export type AcquireResult =
  | { ok: true; token: string }
  | { ok: false; reason: 'busy' | 'error' };

/**
 * Flips onchain_operation none -> `operation` atomically and stamps a unique
 * ownership token. Returns `busy` when another operation currently holds the
 * lock and has not gone stale.
 */
export async function acquireOnchainLock(
  admin: SupabaseClient,
  storeId: string,
  operation: OnchainOperation,
): Promise<AcquireResult> {
  const token = crypto.randomUUID();
  const staleBefore = new Date(Date.now() - LOCK_STALE_MS).toISOString();

  const { data, error } = await admin
    .from('merchant_stores')
    .update({
      onchain_operation: operation,
      onchain_operation_started_at: new Date().toISOString(),
      onchain_operation_token: token,
    })
    .eq('id', storeId)
    .or(`onchain_operation.eq.none,onchain_operation_started_at.lt.${staleBefore}`)
    .select('id');

  if (error) {
    console.error(`[onchain-lock] store=${storeId} acquire failed: ${error.message}`);
    return { ok: false, reason: 'error' };
  }
  if (!data || data.length === 0) return { ok: false, reason: 'busy' };
  return { ok: true, token };
}

/**
 * Confirms this request still owns the lock. Call immediately before any BTCPay
 * write so a superseded operation aborts BEFORE it touches anything.
 */
export async function assertOnchainLockOwnership(
  admin: SupabaseClient,
  storeId: string,
  token: string,
  operation: OnchainOperation,
): Promise<void> {
  const { data: row } = await admin
    .from('merchant_stores')
    .select('onchain_operation, onchain_operation_token')
    .eq('id', storeId)
    .maybeSingle<{ onchain_operation: string; onchain_operation_token: string | null }>();
  if (!row || row.onchain_operation !== operation || row.onchain_operation_token !== token) {
    throw new OnchainLockLost();
  }
}

/** Releases the lock, but only if this request still owns it. */
export async function releaseOnchainLock(
  admin: SupabaseClient,
  storeId: string,
  token: string,
): Promise<void> {
  const { error } = await admin
    .from('merchant_stores')
    .update({
      onchain_operation: 'none',
      onchain_operation_started_at: null,
      onchain_operation_token: null,
    })
    .eq('id', storeId)
    .eq('onchain_operation_token', token);
  if (error) console.error(`[onchain-lock] store=${storeId} release failed: ${error.message}`);
}

/** The one answer every endpoint gives when the store is busy. */
export function onchainLockBusyResponse(): Response {
  return jsonResponse(
    {
      ok: false,
      code: 'WALLET_OPERATION_IN_PROGRESS',
      error: 'Another wallet operation is already in progress for this store. Please try again.',
    },
    409,
  );
}
