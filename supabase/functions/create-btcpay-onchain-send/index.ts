// Edge Function: create-btcpay-onchain-send  (drafted — deploy after schema review)
//
// Prepares an on-chain Bitcoin send for the ACTIVE merchant store: asks BTCPay
// to construct an UNSIGNED PSBT for the reviewed destination/amount/speed,
// decodes that PSBT to derive the AUTHORITATIVE fee and totals (the numbers the
// review screen shows are read from the real transaction, not estimated), and
// records the attempt in merchant_onchain_sends.
//
// NON-CUSTODIAL BOUNDARY: this function can only BUILD a transaction. The
// store wallet is watch-only (xpub/descriptor); BTCPay (live-verified 2.4.3)
// refuses server-side signing for cold wallets and we never request it
// (signWithSeed=false, proceedWithBroadcast=false). The returned PSBT is inert
// until the merchant signs it in their own wallet, and is NEVER persisted —
// only its output summary (scripts + amounts) and a sha256 hash are stored.
//
// Ordering (claim-first, like create-btcpay-invoice):
//   validate -> resolve store (+ no wallet-config op in flight) ->
//   idempotency branch -> CLAIM row ('preparing') -> fee rate -> build PSBT ->
//   decode + cross-check -> commit row ('awaiting_signature') -> respond.
// A BTCPay failure releases the claim so the SAME attempt can retry; a PSBT
// has no side effects, so a released claim leaves nothing behind anywhere.
//
// Required secrets: BTCPAY_SERVER_URL, BTCPAY_GREENFIELD_API_KEY.
// Platform-provided: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.

import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';

import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import {
  BtcpayApiError,
  BtcpayConfigError,
  BtcpayTimeoutError,
  createOnChainTransactionPsbt,
  getBtcpayConfig,
  getOnChainFeeRate,
  satsToBtcDecimalString,
} from '../_shared/btcpay-client.ts';
import { validateIdempotencyKey } from '../_shared/invoice-input.ts';
import {
  decodePsbt,
  hashPsbt,
  isSendSpeed,
  isValidMainnetAddress,
  PsbtDecodeError,
  SEND_SPEEDS,
  toOutputSummary,
} from '../_shared/onchain-send.ts';

type CreateSendErrorCode =
  | 'UNAUTHORIZED'
  | 'BAD_REQUEST'
  | 'STORE_ACCESS_DENIED'
  | 'WALLET_NOT_CONNECTED'
  | 'WALLET_DISABLED'
  | 'WALLET_BUSY'
  | 'INVALID_DESTINATION'
  | 'INVALID_AMOUNT'
  | 'FEE_ESTIMATE_UNAVAILABLE'
  | 'INSUFFICIENT_FUNDS'
  | 'PSBT_CREATE_FAILED'
  | 'INVALID_BTCPAY_RESPONSE'
  | 'SEND_PREPARE_IN_PROGRESS'
  | 'SEND_IN_PROGRESS'
  | 'SEND_ALREADY_FAILED'
  | 'SEND_RECORD_FAILED'
  | 'SERVER_NOT_CONFIGURED';

function errorResponse(code: CreateSendErrorCode, error: string, status: number): Response {
  return jsonResponse({ ok: false, code, error }, status);
}

/** Sats sanity ceiling: total BTC supply. */
const MAX_SATS = 21_000_000 * 100_000_000;

/** A 'preparing' claim older than this is from a dead request and may be
 * superseded. Must exceed the platform's max Edge Function wall-clock. */
const CLAIM_STALE_MS = 15 * 60 * 1000;

interface StoreRow {
  id: string;
  user_id: string;
  btcpay_store_id: string | null;
  onchain_status: string | null;
  onchain_enabled: boolean | null;
  onchain_operation: string | null;
}

interface SendRow {
  id: string;
  status: string;
  destination: string;
  requested_amount_sats: number;
  amount_sats: number | null;
  fee_sats: number | null;
  total_sats: number | null;
  speed: string;
  fee_rate_sat_vb: number | null;
  subtract_fee: boolean;
  txid: string | null;
  created_at: string;
  updated_at: string;
}

const SEND_ROW_COLUMNS =
  'id, status, destination, requested_amount_sats, amount_sats, fee_sats, ' +
  'total_sats, speed, fee_rate_sat_vb, subtract_fee, txid, created_at, updated_at';

/**
 * The client-facing shape of a prepared send. `psbt` is only ever non-null on
 * the response that actually built it — the PSBT is never persisted, so a
 * replayed attempt returns psbt=null and the client starts a fresh attempt.
 */
function sendResponseBody(
  row: SendRow,
  merchantStoreId: string,
  psbt: string | null,
  reused: boolean,
) {
  return {
    ok: true,
    code: 'OK',
    reused,
    merchantStoreId,
    send: {
      sendId: row.id,
      status: row.status,
      destination: row.destination,
      amountSats: row.amount_sats,
      feeSats: row.fee_sats,
      totalSats: row.total_sats,
      amountBtc: row.amount_sats != null ? satsToBtcDecimalString(BigInt(row.amount_sats)) : null,
      feeBtc: row.fee_sats != null ? satsToBtcDecimalString(BigInt(row.fee_sats)) : null,
      totalBtc: row.total_sats != null ? satsToBtcDecimalString(BigInt(row.total_sats)) : null,
      speed: row.speed,
      feeRateSatPerVb: row.fee_rate_sat_vb != null ? Number(row.fee_rate_sat_vb) : null,
      subtractFee: row.subtract_fee,
      psbt,
      txid: row.txid,
      createdAt: row.created_at,
    },
  };
}

async function releaseClaim(admin: SupabaseClient, sendId: string): Promise<void> {
  // Deletes only a still-'preparing' claim so the same attempt can retry.
  const { error } = await admin
    .from('merchant_onchain_sends')
    .delete()
    .eq('id', sendId)
    .eq('status', 'preparing');
  if (error) {
    console.error(`[create-send] send=${sendId} claim release failed: ${error.message}`);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return errorResponse('BAD_REQUEST', 'Method not allowed', 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return errorResponse('SERVER_NOT_CONFIGURED', 'Server is not configured.', 500);
  }

  // 1. Authenticate the Supabase user (JWT in the Authorization header).
  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) {
    return errorResponse('UNAUTHORIZED', 'Missing or invalid Authorization header.', 401);
  }
  const userScoped = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const {
    data: { user },
    error: userError,
  } = await userScoped.auth.getUser();
  if (userError || !user) {
    return errorResponse('UNAUTHORIZED', 'Not authenticated.', 401);
  }

  // 2. Validate input. The client's validation is UX only; this is the boundary.
  let body: {
    merchantStoreId?: unknown;
    idempotencyKey?: unknown;
    destination?: unknown;
    amountSats?: unknown;
    speed?: unknown;
    mode?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return errorResponse('BAD_REQUEST', 'Invalid JSON body.', 400);
  }

  const merchantStoreId =
    typeof body.merchantStoreId === 'string' ? body.merchantStoreId.trim() : '';
  if (!merchantStoreId) {
    return errorResponse('BAD_REQUEST', 'merchantStoreId is required.', 400);
  }

  const keyResult = validateIdempotencyKey(body.idempotencyKey);
  if (!keyResult.ok) {
    return errorResponse('BAD_REQUEST', keyResult.message, 400);
  }
  const idempotencyKey = keyResult.value;

  const destination =
    typeof body.destination === 'string' ? body.destination.trim() : '';
  if (!destination || destination.length > 130 || !isValidMainnetAddress(destination)) {
    return errorResponse(
      'INVALID_DESTINATION',
      'The destination is not a valid Bitcoin address.',
      400,
    );
  }

  const amountSats =
    typeof body.amountSats === 'number' && Number.isSafeInteger(body.amountSats)
      ? body.amountSats
      : NaN;
  if (!Number.isSafeInteger(amountSats) || amountSats <= 0 || amountSats > MAX_SATS) {
    return errorResponse('INVALID_AMOUNT', 'Enter a valid amount to send.', 400);
  }

  if (!isSendSpeed(body.speed)) {
    return errorResponse('BAD_REQUEST', 'speed must be fast, standard, or economy.', 400);
  }
  const speed = body.speed;

  // 'exact' sends amountSats to the destination; 'max' empties the wallet —
  // amountSats must be the full spendable balance and BTCPay deducts the fee
  // from it (subtractFromAmount), so no unspendable remainder is stranded.
  const mode = body.mode === 'max' ? 'max' : body.mode === 'exact' ? 'exact' : null;
  if (!mode) {
    return errorResponse('BAD_REQUEST', 'mode must be exact or max.', 400);
  }
  const subtractFee = mode === 'max';

  // 3. Load the store with the service role, confirm ownership + wallet state.
  // Resolved fresh on every call — a stale client can never spend from a store
  // the user no longer means to act on.
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });
  const { data: store, error: storeError } = await admin
    .from('merchant_stores')
    .select('id, user_id, btcpay_store_id, onchain_status, onchain_enabled, onchain_operation')
    .eq('id', merchantStoreId)
    .maybeSingle<StoreRow>();

  if (storeError) {
    console.error(`[create-send] store lookup failed: ${storeError.message}`);
    return errorResponse('STORE_ACCESS_DENIED', 'Could not load the store.', 500);
  }
  // Report a non-owned or missing store identically so existence isn't leaked.
  if (!store || store.user_id !== user.id) {
    return errorResponse('STORE_ACCESS_DENIED', 'Store not found.', 404);
  }
  if (!store.btcpay_store_id || store.onchain_status !== 'connected') {
    return errorResponse(
      'WALLET_NOT_CONNECTED',
      'No Bitcoin wallet is connected for this store.',
      409,
    );
  }
  if (store.onchain_enabled === false) {
    return errorResponse('WALLET_DISABLED', 'The Bitcoin wallet is disabled for this store.', 409);
  }
  // A send must never interleave with a wallet-configuration operation
  // (connect/replace/remove) — the PSBT would be built against a wallet that is
  // about to change. Sends do NOT take this lock themselves; they only require
  // that no configuration change is in flight.
  if (store.onchain_operation && store.onchain_operation !== 'none') {
    return errorResponse(
      'WALLET_BUSY',
      'The wallet is being updated right now. Try again in a moment.',
      409,
    );
  }

  // 4. Idempotency branch: a retry of the SAME attempt resolves against the
  // existing row instead of building a second competing transaction.
  const { data: existing, error: existingError } = await admin
    .from('merchant_onchain_sends')
    .select(SEND_ROW_COLUMNS)
    .eq('merchant_store_id', store.id)
    .eq('idempotency_key', idempotencyKey)
    .maybeSingle<SendRow>();
  if (existingError) {
    console.error(`[create-send] idempotency read failed: ${existingError.message}`);
    return errorResponse('SEND_RECORD_FAILED', 'Could not check this attempt. Try again.', 500);
  }
  if (existing) {
    if (existing.status === 'preparing') {
      const age = Date.now() - new Date(existing.updated_at).getTime();
      if (age < CLAIM_STALE_MS) {
        return errorResponse(
          'SEND_PREPARE_IN_PROGRESS',
          'This send is already being prepared. Give it a moment.',
          409,
        );
      }
      // Stale claim from a dead request — supersede it and continue below.
      await releaseClaim(admin, existing.id);
    } else {
      // The attempt already completed preparation (or moved further). The PSBT
      // is not persisted, so a replay returns psbt=null — the client treats
      // that as "start a fresh attempt" unless it still holds the PSBT.
      return jsonResponse(sendResponseBody(existing, store.id, null, true));
    }
  }

  // 5. CLAIM the attempt before touching BTCPay. The unique index makes the
  // concurrent duplicate lose cleanly.
  const { data: claimed, error: claimError } = await admin
    .from('merchant_onchain_sends')
    .insert({
      user_id: user.id,
      merchant_store_id: store.id,
      btcpay_store_id: store.btcpay_store_id,
      idempotency_key: idempotencyKey,
      destination,
      requested_amount_sats: amountSats,
      subtract_fee: subtractFee,
      speed,
      confirmation_target: SEND_SPEEDS[speed].blockTarget,
      status: 'preparing',
    })
    .select('id')
    .maybeSingle<{ id: string }>();

  if (claimError || !claimed) {
    if (claimError?.code === '23505') {
      return errorResponse(
        'SEND_PREPARE_IN_PROGRESS',
        'This send is already being prepared. Give it a moment.',
        409,
      );
    }
    console.error(`[create-send] claim failed: ${claimError?.message ?? 'no row'}`);
    return errorResponse('SEND_RECORD_FAILED', 'The send could not be recorded. Try again.', 500);
  }
  const sendId = claimed.id;

  // 6. Resolve the fee rate for the chosen speed server-side — never trusted
  // from the client, always fresh from BTCPay's fee source.
  let config;
  try {
    config = getBtcpayConfig();
  } catch (err) {
    await releaseClaim(admin, sendId);
    const message =
      err instanceof BtcpayConfigError ? err.message : 'BTCPay is not configured.';
    return errorResponse('SERVER_NOT_CONFIGURED', message, 500);
  }

  let feeRateSatPerVb: number;
  try {
    feeRateSatPerVb = await getOnChainFeeRate(
      config,
      store.btcpay_store_id,
      SEND_SPEEDS[speed].blockTarget,
    );
  } catch (err) {
    await releaseClaim(admin, sendId);
    const detail = err instanceof BtcpayApiError ? `HTTP ${err.status}` : String(err);
    console.error(
      `[create-send] store=${store.id} btcpayStore=${store.btcpay_store_id} ` +
        `fee estimate failed: ${detail}`,
    );
    return errorResponse(
      'FEE_ESTIMATE_UNAVAILABLE',
      'Network fee estimates are unavailable right now. Please try again.',
      502,
    );
  }

  // 7. Ask BTCPay to construct the unsigned PSBT (no side effects server-side).
  let psbt: string;
  try {
    psbt = await createOnChainTransactionPsbt(config, store.btcpay_store_id, {
      destination,
      amountBtc: satsToBtcDecimalString(BigInt(amountSats)),
      subtractFromAmount: subtractFee,
      feeRateSatPerVb,
    });
  } catch (err) {
    await releaseClaim(admin, sendId);
    if (err instanceof BtcpayTimeoutError) {
      return errorResponse(
        'PSBT_CREATE_FAILED',
        'BTCPay took too long to prepare the transaction. Please try again.',
        502,
      );
    }
    if (err instanceof BtcpayApiError) {
      const bodyText = JSON.stringify(err.body ?? '').toLowerCase();
      if (
        bodyText.includes('not enough') ||
        bodyText.includes('notenough') ||
        bodyText.includes('insufficient') ||
        // Empty wallet: BTCPay's "There are no available utxos" validation
        // error — to the merchant that IS insufficient funds.
        bodyText.includes('no available utxo')
      ) {
        return errorResponse(
          'INSUFFICIENT_FUNDS',
          'The wallet does not have enough funds to cover this amount plus the network fee.',
          409,
        );
      }
      console.error(
        `[create-send] store=${store.id} btcpayStore=${store.btcpay_store_id} ` +
          `psbt create failed: HTTP ${err.status}`,
      );
      return errorResponse(
        'PSBT_CREATE_FAILED',
        err.status === 400 || err.status === 422
          ? 'BTCPay could not build this transaction. Check the amount and try again.'
          : 'The transaction could not be prepared right now. Please try again.',
        502,
      );
    }
    console.error(`[create-send] store=${store.id} psbt create error: ${String(err)}`);
    return errorResponse(
      'PSBT_CREATE_FAILED',
      'The transaction could not be prepared right now. Please try again.',
      502,
    );
  }

  // 8. Decode the PSBT and cross-check it against the request. The decoded
  // numbers are the authoritative review values; a PSBT that doesn't pay the
  // requested destination the requested amount is refused outright.
  let amountToDestination: bigint;
  let feeSats: bigint;
  let outputSummary;
  try {
    const decoded = decodePsbt(psbt);
    feeSats = decoded.feeSats;

    const destinationOutputs = decoded.outputs.filter((o) => o.address === destination);
    if (destinationOutputs.length !== 1) {
      throw new PsbtDecodeError(
        `expected exactly 1 destination output, found ${destinationOutputs.length}`,
      );
    }
    // One destination -> at most destination + change.
    if (decoded.outputs.length > 2) {
      throw new PsbtDecodeError(`unexpected output count ${decoded.outputs.length}`);
    }
    amountToDestination = destinationOutputs[0].valueSats;

    const expected = subtractFee ? BigInt(amountSats) - feeSats : BigInt(amountSats);
    if (amountToDestination !== expected) {
      throw new PsbtDecodeError(
        `destination output ${amountToDestination} != expected ${expected}`,
      );
    }
    outputSummary = toOutputSummary(decoded.outputs);
  } catch (err) {
    await releaseClaim(admin, sendId);
    const detail = err instanceof PsbtDecodeError ? err.message : String(err);
    console.error(
      `[create-send] store=${store.id} btcpayStore=${store.btcpay_store_id} ` +
        `psbt verification failed: ${detail}`,
    );
    return errorResponse(
      'INVALID_BTCPAY_RESPONSE',
      'BTCPay returned a transaction that does not match this send. Nothing was prepared.',
      502,
    );
  }

  const totalSats = amountToDestination + feeSats;

  // 9. Commit the prepared numbers. The raw PSBT is deliberately NOT stored —
  // only the output summary (verification) and a hash (correlation).
  const { data: committed, error: commitError } = await admin
    .from('merchant_onchain_sends')
    .update({
      status: 'awaiting_signature',
      amount_sats: Number(amountToDestination),
      fee_sats: Number(feeSats),
      total_sats: Number(totalSats),
      fee_rate_sat_vb: feeRateSatPerVb,
      output_summary: outputSummary,
      psbt_hash: await hashPsbt(psbt),
    })
    .eq('id', sendId)
    .eq('status', 'preparing')
    .select(SEND_ROW_COLUMNS)
    .maybeSingle<SendRow>();

  if (commitError || !committed) {
    await releaseClaim(admin, sendId);
    console.error(
      `[create-send] store=${store.id} send=${sendId} commit failed: ` +
        `${commitError?.message ?? 'no row (claim superseded)'}`,
    );
    // A PSBT has no side effects, so failing here is clean — the same attempt
    // (same idempotency key) can simply retry.
    return errorResponse(
      'SEND_RECORD_FAILED',
      'The send could not be recorded. Please try again.',
      500,
    );
  }

  console.log(
    `[create-send] user=${user.id} store=${store.id} btcpayStore=${store.btcpay_store_id} ` +
      `send=${sendId} amountSats=${committed.amount_sats} feeSats=${committed.fee_sats} ` +
      `speed=${speed} feeRate=${feeRateSatPerVb} mode=${mode}`,
  );

  return jsonResponse(sendResponseBody(committed, store.id, psbt, false));
});
