// Edge Function: broadcast-btcpay-onchain-send
//
// Completes a prepared on-chain send: accepts the MERCHANT-SIGNED transaction
// (a signed PSBT in base64, or raw signed hex), verifies it pays EXACTLY the
// outputs recorded when the send was prepared (output_summary — script+value
// per output), and asks BTCPay to broadcast it. "Sent" is only ever reported
// from BTCPay's broadcast response (or a positive reconciliation) — never
// synthesized.
//
// NON-CUSTODIAL BOUNDARY: signing already happened in the merchant's own
// wallet before this function is called. The signed payload passes through to
// BTCPay and is not persisted.
//
// Outcome model (per review): 'failed' is used ONLY when we KNOW nothing was
// broadcast (output tampering). A definite BTCPay rejection (4xx) reverts to
// 'awaiting_signature' so the same send can be re-signed/re-pasted. An
// UNCERTAIN outcome — timeout, lost response, 5xx — moves the send to
// 'reconcile_required' instead of failed: the transaction may be out, so a new
// send must never be invited. Before submission the txid is derived from the
// finalized signed payload (expected_txid), which makes reconciliation
// deterministic: calling this function again for a reconcile_required (or
// stale broadcasting) row looks that txid up in the wallet's transactions —
// found -> 'broadcast'; NOT found -> the send STAYS reconcile_required (a
// lone 404 is not proof — the tx may not have surfaced yet). The only forward
// action from uncertainty is re-broadcasting the byte-identical signed
// transaction (derived txid must match expected_txid), which is idempotent;
// an "already known" node rejection on that retry counts as proof of success.
//
// Concurrency: a status CAS (awaiting_signature -> broadcasting) makes a
// double submission of the same send harmless — the loser sees the in-progress
// or already-broadcast state instead of racing a second broadcast.
//
// Required secrets: BTCPAY_SERVER_URL, BTCPAY_GREENFIELD_API_KEY.
// Platform-provided: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.

import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';

import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import {
  BtcpayApiError,
  BtcpayConfigError,
  broadcastOnChainTransaction,
  getBtcpayConfig,
  onChainWalletTransactionExists,
} from '../_shared/btcpay-client.ts';
import {
  decodeSignedPayloadOutputs,
  extractTxidFromSignedPayload,
  fromOutputSummary,
  signedOutputsMatch,
} from '../_shared/onchain-send.ts';

type BroadcastErrorCode =
  | 'UNAUTHORIZED'
  | 'BAD_REQUEST'
  | 'STORE_ACCESS_DENIED'
  | 'WALLET_NOT_CONNECTED'
  | 'WALLET_DISABLED'
  | 'WALLET_BUSY'
  | 'SEND_NOT_FOUND'
  | 'SEND_NOT_READY'
  | 'SEND_IN_PROGRESS'
  | 'SEND_ALREADY_FAILED'
  | 'SEND_RECONCILE_REQUIRED'
  | 'INVALID_SIGNED_TRANSACTION'
  | 'SIGNED_TRANSACTION_MISMATCH'
  | 'BROADCAST_FAILED'
  | 'SERVER_NOT_CONFIGURED';

function errorResponse(code: BroadcastErrorCode, error: string, status: number): Response {
  return jsonResponse({ ok: false, code, error }, status);
}

/** Generous ceiling for a signed tx payload; a real one is a few KB. */
const MAX_SIGNED_PAYLOAD_BYTES = 200_000;

/** A 'broadcasting' row older than this is from a dead request; reconcile it.
 * Must exceed the platform's max Edge Function wall-clock. */
const BROADCASTING_STALE_MS = 15 * 60 * 1000;

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
  user_id: string;
  merchant_store_id: string;
  btcpay_store_id: string;
  status: string;
  destination: string;
  amount_sats: number | null;
  fee_sats: number | null;
  total_sats: number | null;
  output_summary: unknown;
  expected_txid: string | null;
  txid: string | null;
  updated_at: string;
}

function successBody(row: SendRow, txid: string | null, syncWarning = false) {
  return {
    ok: true,
    code: 'OK',
    sendId: row.id,
    status: 'broadcast',
    txid,
    destination: row.destination,
    amountSats: row.amount_sats,
    feeSats: row.fee_sats,
    totalSats: row.total_sats,
    // True when the broadcast succeeded but our own record didn't update —
    // the client must still treat this as SENT (the transaction is real).
    syncWarning,
  };
}

async function setStatus(
  admin: SupabaseClient,
  sendId: string,
  fromStatus: string,
  patch: Record<string, unknown>,
): Promise<boolean> {
  const { data, error } = await admin
    .from('merchant_onchain_sends')
    .update(patch)
    .eq('id', sendId)
    .eq('status', fromStatus)
    .select('id');
  if (error) {
    console.error(`[broadcast-send] send=${sendId} status update failed: ${error.message}`);
    return false;
  }
  return (data?.length ?? 0) > 0;
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

  // 2. Validate input. signedTransaction may be EMPTY for a pure status-check /
  // reconcile call — it is only required when an actual broadcast is needed.
  let body: { merchantStoreId?: unknown; sendId?: unknown; signedTransaction?: unknown };
  try {
    body = await req.json();
  } catch {
    return errorResponse('BAD_REQUEST', 'Invalid JSON body.', 400);
  }
  const merchantStoreId =
    typeof body.merchantStoreId === 'string' ? body.merchantStoreId.trim() : '';
  const sendId = typeof body.sendId === 'string' ? body.sendId.trim() : '';
  const signedTransaction =
    typeof body.signedTransaction === 'string' ? body.signedTransaction.trim() : '';
  if (!merchantStoreId || !sendId) {
    return errorResponse('BAD_REQUEST', 'merchantStoreId and sendId are required.', 400);
  }
  if (signedTransaction.length > MAX_SIGNED_PAYLOAD_BYTES) {
    return errorResponse(
      'INVALID_SIGNED_TRANSACTION',
      'The signed transaction is too large to be valid.',
      400,
    );
  }

  // 3. Load the store with the service role, confirm ownership + wallet state.
  // Re-resolved on every call — never trusted from client state.
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });
  const { data: store, error: storeError } = await admin
    .from('merchant_stores')
    .select('id, user_id, btcpay_store_id, onchain_status, onchain_enabled, onchain_operation')
    .eq('id', merchantStoreId)
    .maybeSingle<StoreRow>();

  if (storeError) {
    console.error(`[broadcast-send] store lookup failed: ${storeError.message}`);
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
  // Never broadcast while a wallet-configuration operation is in flight.
  if (store.onchain_operation && store.onchain_operation !== 'none') {
    return errorResponse(
      'WALLET_BUSY',
      'The wallet is being updated right now. Try again in a moment.',
      409,
    );
  }

  // 4. Load the prepared send; it must belong to this user AND this store (a
  // send prepared for one store can never be broadcast under another).
  const { data: send, error: sendError } = await admin
    .from('merchant_onchain_sends')
    .select(
      'id, user_id, merchant_store_id, btcpay_store_id, status, destination, ' +
        'amount_sats, fee_sats, total_sats, output_summary, expected_txid, txid, updated_at',
    )
    .eq('id', sendId)
    .maybeSingle<SendRow>();

  if (sendError) {
    console.error(`[broadcast-send] send lookup failed: ${sendError.message}`);
    return errorResponse('SEND_NOT_FOUND', 'Could not load this send.', 500);
  }
  if (!send || send.user_id !== user.id || send.merchant_store_id !== store.id) {
    return errorResponse('SEND_NOT_FOUND', 'This send could not be found.', 404);
  }

  let config;
  try {
    config = getBtcpayConfig();
  } catch (err) {
    const message =
      err instanceof BtcpayConfigError ? err.message : 'BTCPay is not configured.';
    return errorResponse('SERVER_NOT_CONFIGURED', message, 500);
  }

  // 5. Branch on state — replays, races, and uncertain outcomes resolve
  // deterministically. A reconcile never initiates a new Bitcoin transaction.
  const status = send.status;

  if (status === 'broadcast') {
    // Idempotent replay: the transaction is already out; report the same result.
    return jsonResponse(successBody(send, send.txid));
  }
  if (status === 'preparing') {
    return errorResponse('SEND_NOT_READY', 'This send has not finished preparing.', 409);
  }
  if (status === 'failed') {
    return errorResponse(
      'SEND_ALREADY_FAILED',
      'This send was rejected. Start a new send from the review screen.',
      409,
    );
  }

  const broadcastingIsStale =
    status === 'broadcasting' &&
    Date.now() - new Date(send.updated_at).getTime() > BROADCASTING_STALE_MS;

  if (status === 'broadcasting' && !broadcastingIsStale) {
    return errorResponse(
      'SEND_IN_PROGRESS',
      'This send is already being broadcast. Give it a moment.',
      409,
    );
  }

  if (status === 'reconcile_required' || broadcastingIsStale) {
    // The signed transaction may or may not have reached the network. Resolve
    // by asking BTCPay for the txid we derived before submission.
    if (!send.expected_txid) {
      // No deterministic handle — refuse to guess, and never invite a new send.
      return errorResponse(
        'SEND_RECONCILE_REQUIRED',
        'This send’s outcome couldn’t be confirmed. Check Activity for the transaction before doing anything else.',
        409,
      );
    }
    let exists: boolean;
    try {
      exists = await onChainWalletTransactionExists(
        config,
        store.btcpay_store_id,
        send.expected_txid,
      );
    } catch (err) {
      const detail = err instanceof BtcpayApiError ? `HTTP ${err.status}` : String(err);
      console.error(
        `[broadcast-send] send=${send.id} reconcile lookup failed: ${detail}`,
      );
      return errorResponse(
        'SEND_RECONCILE_REQUIRED',
        'The send’s status couldn’t be confirmed yet. Try checking again in a moment.',
        503,
      );
    }
    if (exists) {
      // The transaction IS on the network — this send succeeded.
      await setStatus(admin, send.id, status, {
        status: 'broadcast',
        txid: send.expected_txid,
        error_code: null,
      });
      console.log(
        `[broadcast-send] user=${user.id} store=${store.id} send=${send.id} ` +
          `reconciled as broadcast txid=${send.expected_txid}`,
      );
      return jsonResponse(successBody(send, send.expected_txid));
    }

    // Not found. A lone 404 is NOT proof the transaction never made it — the
    // wallet may simply not have indexed it yet (the exact race: node accepted
    // it, our HTTP response was lost, lookup runs before it surfaces). Never
    // re-arm the send off a single 404. The one safe forward action: if this
    // call carries THE EXACT SAME signed transaction (derived txid matches),
    // re-broadcasting it is idempotent — it can complete the send but can
    // never duplicate the payment.
    const sameTx =
      signedTransaction.length > 0 &&
      extractTxidFromSignedPayload(signedTransaction) === send.expected_txid;

    if (!sameTx) {
      if (broadcastingIsStale) {
        // Classify the dead 'broadcasting' lock honestly so later calls take
        // the reconcile path directly.
        await setStatus(admin, send.id, 'broadcasting', {
          status: 'reconcile_required',
          error_code: 'BROADCAST_OUTCOME_UNKNOWN',
        });
      }
      return errorResponse(
        'SEND_RECONCILE_REQUIRED',
        'The broadcast result is still being verified. Check status again shortly — don’t create a new send.',
        409,
      );
    }

    // Same-transaction retry. Re-enter 'broadcasting' via CAS so a concurrent
    // reconcile can't race this one.
    if (status === 'reconcile_required') {
      const relocked = await setStatus(admin, send.id, 'reconcile_required', {
        status: 'broadcasting',
      });
      if (!relocked) {
        return errorResponse(
          'SEND_IN_PROGRESS',
          'This send is being handled elsewhere. Give it a moment.',
          409,
        );
      }
    }
    try {
      const result = await broadcastOnChainTransaction(
        config,
        store.btcpay_store_id,
        signedTransaction,
      );
      const confirmedTxid = result.transactionHash ?? send.expected_txid;
      await setStatus(admin, send.id, 'broadcasting', {
        status: 'broadcast',
        txid: confirmedTxid,
        error_code: null,
      });
      console.log(
        `[broadcast-send] user=${user.id} store=${store.id} send=${send.id} ` +
          `reconcile retry broadcast succeeded txid=${confirmedTxid ?? 'unknown'}`,
      );
      return jsonResponse(successBody(send, confirmedTxid));
    } catch (err) {
      // A node rejection saying the transaction is ALREADY KNOWN is positive
      // proof the original submission landed — that is a success.
      const bodyText =
        err instanceof BtcpayApiError
          ? JSON.stringify(err.body ?? '').toLowerCase()
          : '';
      if (bodyText.includes('already')) {
        await setStatus(admin, send.id, 'broadcasting', {
          status: 'broadcast',
          txid: send.expected_txid,
          error_code: null,
        });
        console.log(
          `[broadcast-send] user=${user.id} store=${store.id} send=${send.id} ` +
            `reconcile retry: node reports already-known — broadcast txid=${send.expected_txid}`,
        );
        return jsonResponse(successBody(send, send.expected_txid));
      }
      // Anything else stays UNCERTAIN: even a rejection here doesn't prove the
      // original submission failed. Preserve the state; never invite a resend.
      await setStatus(admin, send.id, 'broadcasting', {
        status: 'reconcile_required',
        error_code: 'BROADCAST_OUTCOME_UNKNOWN',
      });
      const detail = err instanceof BtcpayApiError ? `HTTP ${err.status}` : String(err);
      console.error(
        `[broadcast-send] send=${send.id} reconcile retry failed (${detail}) — staying reconcile_required`,
      );
      return errorResponse(
        'SEND_RECONCILE_REQUIRED',
        'The broadcast result is still being verified. Check status again shortly — don’t create a new send.',
        503,
      );
    }
  }

  // From here on an actual broadcast is required, so the payload is too.
  if (!signedTransaction) {
    return errorResponse(
      'INVALID_SIGNED_TRANSACTION',
      'The transaction was not sent. Paste the signed transaction from your wallet.',
      400,
    );
  }

  // 6. Verify the signed payload before touching BTCPay: it must parse, and its
  // outputs must be EXACTLY the prepared outputs (destination, amount, change,
  // and implied fee all pinned by the stored output summary). The client is
  // never trusted to claim the PSBT is unchanged.
  const signedOutputs = decodeSignedPayloadOutputs(signedTransaction);
  if (!signedOutputs) {
    return errorResponse(
      'INVALID_SIGNED_TRANSACTION',
      'That doesn’t look like a signed transaction. Export the signed PSBT from your wallet and try again.',
      400,
    );
  }
  const preparedOutputs = fromOutputSummary(send.output_summary);
  if (!preparedOutputs) {
    console.error(`[broadcast-send] send=${send.id} stored output summary unreadable`);
    return errorResponse('BROADCAST_FAILED', 'This send is corrupted. Start a new send.', 500);
  }
  if (!signedOutputsMatch(preparedOutputs, signedOutputs)) {
    console.error(
      `[broadcast-send] user=${user.id} store=${store.id} send=${send.id} ` +
        `SIGNED OUTPUT MISMATCH — refusing to broadcast`,
    );
    // Terminal 'failed': nothing was broadcast, and no other payload may ever
    // be tried against this reviewed send.
    await setStatus(admin, send.id, 'awaiting_signature', {
      status: 'failed',
      error_code: 'SIGNED_TRANSACTION_MISMATCH',
    });
    return errorResponse(
      'SIGNED_TRANSACTION_MISMATCH',
      'The signed transaction does not match what you reviewed. Nothing was sent. Start a new send.',
      409,
    );
  }

  // 7. Derive the txid from the finalized signed payload BEFORE submission and
  // record it with the broadcasting lock — the deterministic handle for
  // reconciliation if the outcome becomes uncertain.
  const expectedTxid = extractTxidFromSignedPayload(signedTransaction);

  const locked = await setStatus(admin, send.id, 'awaiting_signature', {
    status: 'broadcasting',
    expected_txid: expectedTxid,
  });
  if (!locked) {
    const { data: current } = await admin
      .from('merchant_onchain_sends')
      .select('status, txid')
      .eq('id', send.id)
      .maybeSingle<{ status: string; txid: string | null }>();
    if (current?.status === 'broadcast') {
      return jsonResponse(successBody(send, current.txid));
    }
    return errorResponse(
      'SEND_IN_PROGRESS',
      'This send is already being broadcast. Give it a moment.',
      409,
    );
  }

  // 8. Broadcast through BTCPay. Failure classification:
  //    - definite rejection (4xx: invalid/not-final/unknown route) -> nothing
  //      was broadcast -> re-arm awaiting_signature
  //    - uncertain (network failure, timeout, 5xx) -> reconcile_required; the
  //      transaction may be out, so a retry/new-send must not be invited.
  let txid: string | null;
  try {
    const result = await broadcastOnChainTransaction(
      config,
      store.btcpay_store_id,
      signedTransaction,
    );
    txid = result.transactionHash ?? expectedTxid;
  } catch (err) {
    const httpStatus = err instanceof BtcpayApiError ? err.status : 0;
    const definiteRejection = httpStatus >= 400 && httpStatus < 500;

    if (definiteRejection) {
      await setStatus(admin, send.id, 'broadcasting', { status: 'awaiting_signature' });
      console.error(
        `[broadcast-send] user=${user.id} store=${store.id} send=${send.id} ` +
          `broadcast rejected: HTTP ${httpStatus}`,
      );
      if (httpStatus === 422) {
        return errorResponse(
          'INVALID_SIGNED_TRANSACTION',
          'The transaction isn’t fully signed. Sign it in your wallet and paste the result again.',
          400,
        );
      }
      return errorResponse(
        'BROADCAST_FAILED',
        'The network broadcast was rejected. Nothing was sent — please try again.',
        502,
      );
    }

    // Uncertain outcome — the request may have reached the node.
    await setStatus(admin, send.id, 'broadcasting', {
      status: 'reconcile_required',
      error_code: 'BROADCAST_OUTCOME_UNKNOWN',
    });
    console.error(
      `[broadcast-send] user=${user.id} store=${store.id} send=${send.id} ` +
        `broadcast outcome UNKNOWN (status=${httpStatus}) expectedTxid=${expectedTxid ?? 'none'}`,
    );
    return errorResponse(
      'SEND_RECONCILE_REQUIRED',
      'We couldn’t confirm whether the transaction was sent. Don’t send again — use Check status.',
      503,
    );
  }

  // 9. The transaction is OUT. From here on this is a success no matter what —
  // a bookkeeping failure must never be reported as a failed send.
  const committed = await setStatus(admin, send.id, 'broadcasting', {
    status: 'broadcast',
    txid,
    error_code: null,
  });

  console.log(
    `[broadcast-send] user=${user.id} store=${store.id} btcpayStore=${store.btcpay_store_id} ` +
      `send=${send.id} broadcast txid=${txid ?? 'unknown'} committed=${committed}`,
  );

  return jsonResponse(successBody(send, txid, !committed));
});
