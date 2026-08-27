// Edge Function: create-btcpay-payment-request
//
// Creates a real BTCPay Payment Request (a long-lived payment link) for the
// authenticated merchant's store, records the minimum useful metadata in
// Supabase, and returns a normalized Hachisu model to the mobile app.
//
// Architecture mirrors create-btcpay-invoice deliberately — same security model,
// same idempotency claim flow, same partial-failure contract:
//   * The client sends only Hachisu's internal merchantStoreId. It may NOT send
//     a btcpay_store_id, a Greenfield key, or any payment state.
//   * Not-found and not-yours return the SAME 404 (no cross-merchant probing).
//   * validate -> resolve store -> resolve BTCPay methods -> claim idempotency ->
//     create in BTCPay -> persist -> respond. A BTCPay failure never leaves a
//     phantom Supabase row; a Supabase failure after BTCPay succeeded is
//     reported distinctly (207) with the authoritative id + URL so the merchant
//     never creates a duplicate.
//
// Payment-request specifics (verified live against the deployed server):
//   * BTCPay requires an amount (> 0) even when allowCustomPaymentAmounts is on
//     — the flag lets customers PARTIALLY pay / choose amounts against it.
//   * `description` renders as HTML on the public page, so the plain-text memo
//     is escaped before sending.
//   * `email` is metadata attached to generated invoices; nothing is sent.
//   * Greenfield returns NO URL — the public page URL is built here from the
//     configured server origin, never on the client.
//
// Required secrets: BTCPAY_SERVER_URL, BTCPAY_GREENFIELD_API_KEY.
// Platform-provided: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.

import { createClient } from 'jsr:@supabase/supabase-js@2';

import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import {
  BtcpayApiError,
  BtcpayConfigError,
  BtcpayTimeoutError,
  buildPaymentRequestUrl,
  createStorePaymentRequest,
  escapeHtmlText,
  getBtcpayConfig,
  listStoreEnabledPaymentMethods,
  type BtcpayPaymentRequest,
} from '../_shared/btcpay-client.ts';
import {
  validateAmount,
  validateCurrency,
  validateIdempotencyKey,
  validateOptionalEmail,
  validateOptionalText,
} from '../_shared/invoice-input.ts';
import {
  customerDataOptionForFormId,
  MAX_MEMO_LENGTH,
  MAX_REFERENCE_ID_LENGTH,
  validateCustomerDataOption,
  validateExpiresInHours,
  validateTitle,
} from '../_shared/payment-request-input.ts';

/**
 * Service-role client factory.
 *
 * Helper signatures must be typed from an ACTUAL construction: a bare
 * `ReturnType<typeof createClient>` resolves supabase-js's DEFAULT generics
 * (whose schema is `never`), not the ones inferred at the call site, so every
 * `.from(...)` inside such a helper collapses to `never` and fails type-check.
 * Naming the construction keeps the inferred type and changes no behavior.
 */
function createAdminClient(url: string, serviceRoleKey: string) {
  return createClient(url, serviceRoleKey, { auth: { persistSession: false } });
}

type AdminClient = ReturnType<typeof createAdminClient>;

/** Normalized result codes shared with the mobile client. */
type ResultCode =
  | 'UNAUTHORIZED'
  | 'INVALID_REQUEST'
  | 'STORE_NOT_FOUND'
  | 'STORE_NOT_PROVISIONED'
  | 'INVALID_AMOUNT'
  | 'INVALID_CURRENCY'
  | 'INVALID_BUYER_EMAIL'
  | 'INVALID_EXPIRATION'
  | 'INVALID_CUSTOMER_DATA_OPTION'
  | 'NO_PAYMENT_METHOD_AVAILABLE'
  | 'PAYMENT_METHOD_LOOKUP_FAILED'
  | 'BTCPAY_PAYMENT_REQUEST_CREATE_FAILED'
  | 'INVALID_BTCPAY_RESPONSE'
  | 'PAYMENT_REQUEST_CREATED_SYNC_FAILED'
  | 'PAYMENT_REQUEST_CREATE_IN_PROGRESS'
  | 'SERVER_ERROR';

interface StoreRow {
  id: string;
  user_id: string;
  btcpay_store_id: string | null;
  name: string;
  default_currency: string;
}

/** See create-btcpay-invoice: a claim older than this provably belongs to a dead
 * request (far above the platform's max edge-function wall clock). */
const CLAIM_STALE_MS = 15 * 60 * 1000;

function errorResponse(code: ResultCode, error: string, status: number, extra?: Record<string, unknown>) {
  return jsonResponse({ ok: false, code, error, ...(extra ?? {}) }, status);
}

Deno.serve(async (req) => {
  const startedAt = Date.now();

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return errorResponse('INVALID_REQUEST', 'Method not allowed', 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return errorResponse('SERVER_ERROR', 'Server is not configured.', 500);
  }

  // --- 1. Authenticate -----------------------------------------------------
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

  // --- 2. Parse + validate the body ---------------------------------------
  let body: Record<string, unknown>;
  try {
    const parsed = await req.json();
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('shape');
    body = parsed as Record<string, unknown>;
  } catch {
    return errorResponse('INVALID_REQUEST', 'Invalid JSON body.', 400);
  }

  const merchantStoreId =
    typeof body.merchantStoreId === 'string' ? body.merchantStoreId.trim() : '';
  if (!merchantStoreId) {
    return errorResponse('INVALID_REQUEST', 'merchantStoreId is required.', 400);
  }

  const idempotency = validateIdempotencyKey(body.idempotencyKey);
  if (!idempotency.ok) return inputError(idempotency.code, idempotency.message);
  const idempotencyKey = idempotency.value;

  const title = validateTitle(body.title);
  if (!title.ok) return inputError(title.code, title.message);

  // BTCPay requires a positive amount on every payment request — including ones
  // that allow custom amounts (the flag governs how customers may pay AGAINST
  // the requested amount, not whether one exists).
  const amount = validateAmount(body.amount);
  if (!amount.ok) return inputError(amount.code, amount.message);

  const allowCustomAmounts = body.allowCustomAmounts === true;

  const memo = validateOptionalText(body.memo, MAX_MEMO_LENGTH, 'Memo');
  if (!memo.ok) return inputError(memo.code, memo.message);

  const referenceId = validateOptionalText(
    body.referenceId,
    MAX_REFERENCE_ID_LENGTH,
    'Reference ID',
  );
  if (!referenceId.ok) return inputError(referenceId.code, referenceId.message);

  const recipientEmail = validateOptionalEmail(body.recipientEmail, 'recipient email');
  if (!recipientEmail.ok) return inputError(recipientEmail.code, recipientEmail.message);

  const expiresInHours = validateExpiresInHours(body.expiresInHours);
  if (!expiresInHours.ok) return inputError(expiresInHours.code, expiresInHours.message);

  const customerData = validateCustomerDataOption(body.customerDataOption);
  if (!customerData.ok) return inputError(customerData.code, customerData.message);

  // --- 3. Resolve the store + verify ownership ----------------------------
  const admin = createAdminClient(supabaseUrl, serviceRoleKey);

  const { data: store, error: storeError } = await admin
    .from('merchant_stores')
    .select('id, user_id, btcpay_store_id, name, default_currency')
    .eq('id', merchantStoreId)
    .maybeSingle<StoreRow>();
  if (storeError) {
    console.error(`[payment-request:create] user=${user.id} store lookup failed:`, storeError.message);
    return errorResponse('SERVER_ERROR', 'Could not load the store.', 500);
  }
  // Not-found and not-yours are deliberately indistinguishable to the caller.
  if (!store || store.user_id !== user.id) {
    return errorResponse('STORE_NOT_FOUND', 'Store not found.', 404);
  }
  if (!store.btcpay_store_id) {
    return errorResponse(
      'STORE_NOT_PROVISIONED',
      'This store is not connected to BTCPay yet.',
      409,
    );
  }
  const btcpayStoreId = store.btcpay_store_id;

  // Currency resolves AFTER the store is known so an omitted client value falls
  // back to this store's configured currency, never a global default.
  const currency = validateCurrency(body.currency, store.default_currency);
  if (!currency.ok) return inputError(currency.code, currency.message);

  let config;
  try {
    config = getBtcpayConfig();
  } catch (err) {
    const message = err instanceof BtcpayConfigError ? err.message : 'BTCPay is not configured.';
    return errorResponse('SERVER_ERROR', message, 500);
  }

  const logPrefix =
    `[payment-request:create] user=${user.id} store=${store.id} btcpayStore=${btcpayStoreId} ` +
    `key=${idempotencyKey}`;

  // --- 4. Idempotency: return the prior request, or claim this attempt -----
  const existing = await readClaim(admin, store.id, idempotencyKey);
  if (existing === 'error') {
    return errorResponse('SERVER_ERROR', 'Could not check for an existing payment request.', 500);
  }
  if (existing) {
    if (existing.btcpay_payment_request_id) {
      console.log(
        `${logPrefix} result=PAYMENT_REQUEST_ALREADY_CREATED request=${existing.btcpay_payment_request_id}`,
      );
      return jsonResponse({
        ok: true,
        reused: true,
        paymentRequest: paymentRequestFromRow(existing, store.id),
      });
    }
    // A claim with no request id: a request is running right now, or one died
    // mid-flight. Either way a second BTCPay create for this attempt is unsafe.
    // A fresh submission carries a NEW key, so the merchant is never wedged.
    const ageMs = Date.now() - new Date(existing.created_at).getTime();
    console.log(`${logPrefix} result=PAYMENT_REQUEST_CREATE_IN_PROGRESS ageMs=${ageMs}`);
    return errorResponse(
      'PAYMENT_REQUEST_CREATE_IN_PROGRESS',
      ageMs > CLAIM_STALE_MS
        ? 'A previous attempt for this payment request did not finish. Check BTCPay before creating it again.'
        : 'This payment request is already being created.',
      409,
    );
  }

  // --- 5. Confirm the store can actually be paid --------------------------
  //
  // A payment request generates ordinary invoices when the customer pays, using
  // the store's enabled payment methods. A store with none would produce a link
  // the customer cannot pay — refuse up front, exactly like Create Invoice.
  try {
    const methods = await listStoreEnabledPaymentMethods(config, btcpayStoreId, {
      timeoutMs: 10_000,
    });
    if (methods.length === 0) {
      console.log(`${logPrefix} result=NO_PAYMENT_METHOD_AVAILABLE storeEnabled=none`);
      return errorResponse(
        'NO_PAYMENT_METHOD_AVAILABLE',
        'Set up a Bitcoin payment method before creating a payment request.',
        409,
      );
    }
  } catch (err) {
    // A lookup FAILURE is never treated as "no payment methods".
    console.error(`${logPrefix} result=PAYMENT_METHOD_LOOKUP_FAILED ${describeBtcpayError(err)}`);
    return errorResponse(
      'PAYMENT_METHOD_LOOKUP_FAILED',
      'Could not check this store’s payment methods right now. Try again.',
      502,
    );
  }

  // --- 6. Claim the attempt BEFORE calling BTCPay -------------------------
  const expiresAtIso =
    expiresInHours.value != null
      ? new Date(Date.now() + expiresInHours.value * 3_600_000).toISOString()
      : null;

  const claimed = await insertClaim(admin, {
    user_id: user.id,
    merchant_store_id: store.id,
    btcpay_store_id: btcpayStoreId,
    idempotency_key: idempotencyKey,
    amount: amount.value,
    currency: currency.value,
    title: title.value,
    memo: memo.value,
    reference_id: referenceId.value,
    recipient_email: recipientEmail.value,
    allow_custom_amounts: allowCustomAmounts,
    form_id: customerData.value.formId,
    expires_at: expiresAtIso,
  });
  if (claimed === 'duplicate') {
    console.log(`${logPrefix} result=PAYMENT_REQUEST_CREATE_IN_PROGRESS reason=claim_race`);
    return errorResponse(
      'PAYMENT_REQUEST_CREATE_IN_PROGRESS',
      'This payment request is already being created.',
      409,
    );
  }
  if (claimed === 'error') {
    return errorResponse('SERVER_ERROR', 'Could not start payment request creation.', 500);
  }

  // --- 7. Create the payment request in BTCPay ----------------------------
  let paymentRequest: BtcpayPaymentRequest;
  try {
    paymentRequest = await createStorePaymentRequest(config, btcpayStoreId, {
      amount: amount.value,
      title: title.value,
      currency: currency.value,
      // Escaped because BTCPay renders this field as HTML on the public page.
      description: memo.value ? escapeHtmlText(memo.value) : null,
      email: recipientEmail.value,
      referenceId: referenceId.value,
      allowCustomPaymentAmounts: allowCustomAmounts,
      formId: customerData.value.formId,
      expiryDate:
        expiresAtIso != null ? Math.floor(new Date(expiresAtIso).getTime() / 1000) : null,
    });
  } catch (err) {
    // BTCPay did NOT create the request -> remove the claim so this same
    // attempt can be retried; never leave a Supabase-only phantom row.
    await releaseClaim(admin, store.id, idempotencyKey);
    const detail = describeBtcpayError(err);
    console.error(
      `${logPrefix} result=BTCPAY_PAYMENT_REQUEST_CREATE_FAILED ${detail} durationMs=${Date.now() - startedAt}`,
    );

    if (err instanceof BtcpayApiError && err.status === 403) {
      return errorResponse(
        'BTCPAY_PAYMENT_REQUEST_CREATE_FAILED',
        'Hachisu is not permitted to create payment requests for this store.',
        502,
      );
    }
    return errorResponse(
      'BTCPAY_PAYMENT_REQUEST_CREATE_FAILED',
      'Payment request could not be created right now. Try again.',
      502,
    );
  }

  // BTCPay's values are authoritative from here on. NOTE: it echoes amount as a
  // JSON number, so Hachisu's validated decimal STRING stays the money value.
  const btcpayStatus = typeof paymentRequest.status === 'string' ? paymentRequest.status : null;
  const createdAt = unixToIso(paymentRequest.createdTime) ?? new Date().toISOString();
  const expiresAt = unixToIso(paymentRequest.expiryDate) ?? expiresAtIso;
  // Built from the CONFIGURED server origin (Greenfield returns no URL field).
  const requestUrl = buildPaymentRequestUrl(config.serverUrl, paymentRequest.id);

  const responseModel = {
    merchantStoreId: store.id,
    btcpayPaymentRequestId: paymentRequest.id,
    status: btcpayStatus,
    archived: paymentRequest.archived === true,
    amount: amount.value,
    currency: typeof paymentRequest.currency === 'string' ? paymentRequest.currency : currency.value,
    title: title.value,
    memo: memo.value,
    referenceId: referenceId.value,
    recipientEmail: recipientEmail.value,
    allowCustomAmounts,
    customerDataOption: customerDataOptionForFormId(paymentRequest.formId),
    createdAt,
    expiresAt,
    requestUrl,
  };

  // --- 8. Persist (idempotent on merchant_store_id + idempotency_key) -----
  const { error: syncError } = await admin
    .from('merchant_payment_requests')
    .update({
      btcpay_payment_request_id: paymentRequest.id,
      sync_status: 'created',
      btcpay_status: btcpayStatus,
      request_url: requestUrl,
      expires_at: expiresAt,
    })
    .eq('merchant_store_id', store.id)
    .eq('idempotency_key', idempotencyKey);

  const durationMs = Date.now() - startedAt;

  if (syncError) {
    // The request EXISTS in BTCPay. Report the outcome distinctly and return the
    // authoritative id + URL so the merchant never creates a duplicate.
    console.error(
      `${logPrefix} result=PAYMENT_REQUEST_CREATED_SYNC_FAILED request=${paymentRequest.id} ` +
        `status=${btcpayStatus} dbError=${syncError.message} durationMs=${durationMs}`,
    );
    await admin
      .from('merchant_payment_requests')
      .update({ sync_status: 'sync_failed', btcpay_status: btcpayStatus })
      .eq('merchant_store_id', store.id)
      .eq('idempotency_key', idempotencyKey);

    return jsonResponse(
      {
        ok: false,
        code: 'PAYMENT_REQUEST_CREATED_SYNC_FAILED' satisfies ResultCode,
        error:
          'The payment request was created, but Hachisu could not finish syncing it. ' +
          'Do not create another payment request yet.',
        paymentRequest: responseModel,
      },
      207,
    );
  }

  console.log(
    `${logPrefix} result=OK request=${paymentRequest.id} status=${btcpayStatus} ` +
      `currency=${responseModel.currency} allowCustomAmounts=${allowCustomAmounts} ` +
      `formId=${customerData.value.formId ?? 'none'} ` +
      `recipientEmail=${recipientEmail.value ? 'set' : 'unset'} ` +
      `expiresAt=${expiresAt ?? 'never'} durationMs=${durationMs}`,
  );

  return jsonResponse({ ok: true, reused: false, paymentRequest: responseModel });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function inputError(code: string, message: string): Response {
  return errorResponse(code as ResultCode, message, 400);
}

interface ClaimRow {
  id: string;
  btcpay_payment_request_id: string | null;
  btcpay_status: string | null;
  amount: string | number;
  currency: string;
  title: string;
  memo: string | null;
  reference_id: string | null;
  recipient_email: string | null;
  allow_custom_amounts: boolean;
  form_id: string | null;
  request_url: string | null;
  created_at: string;
  expires_at: string | null;
}

const CLAIM_COLUMNS =
  'id, btcpay_payment_request_id, btcpay_status, amount, currency, title, memo, ' +
  'reference_id, recipient_email, allow_custom_amounts, form_id, request_url, ' +
  'created_at, expires_at';

async function readClaim(
  admin: AdminClient,
  merchantStoreId: string,
  idempotencyKey: string,
): Promise<ClaimRow | null | 'error'> {
  const { data, error } = await admin
    .from('merchant_payment_requests')
    .select(CLAIM_COLUMNS)
    .eq('merchant_store_id', merchantStoreId)
    .eq('idempotency_key', idempotencyKey)
    .maybeSingle<ClaimRow>();
  if (error) {
    console.error(`[payment-request:create] claim read failed: ${error.message}`);
    return 'error';
  }
  return data ?? null;
}

async function insertClaim(
  admin: AdminClient,
  row: Record<string, unknown>,
): Promise<'ok' | 'duplicate' | 'error'> {
  const { error } = await admin
    .from('merchant_payment_requests')
    .insert({ ...row, sync_status: 'creating' });
  if (!error) return 'ok';
  // 23505 = unique_violation -> a concurrent request already claimed this key.
  if (error.code === '23505') return 'duplicate';
  console.error(`[payment-request:create] claim insert failed: ${error.message}`);
  return 'error';
}

/** Removes an unfulfilled claim so the SAME attempt can be retried after a
 * BTCPay failure. Only ever deletes a row with no BTCPay request attached. */
async function releaseClaim(
  admin: AdminClient,
  merchantStoreId: string,
  idempotencyKey: string,
): Promise<void> {
  const { error } = await admin
    .from('merchant_payment_requests')
    .delete()
    .eq('merchant_store_id', merchantStoreId)
    .eq('idempotency_key', idempotencyKey)
    .is('btcpay_payment_request_id', null);
  if (error) {
    console.error(`[payment-request:create] claim release failed: ${error.message}`);
  }
}

function paymentRequestFromRow(row: ClaimRow, merchantStoreId: string) {
  return {
    merchantStoreId,
    btcpayPaymentRequestId: row.btcpay_payment_request_id,
    status: row.btcpay_status,
    archived: false,
    amount: typeof row.amount === 'string' ? row.amount : String(row.amount),
    currency: row.currency,
    title: row.title,
    memo: row.memo,
    referenceId: row.reference_id,
    recipientEmail: row.recipient_email,
    allowCustomAmounts: row.allow_custom_amounts === true,
    customerDataOption: customerDataOptionForFormId(row.form_id),
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    requestUrl: row.request_url,
  };
}

function unixToIso(seconds: unknown): string | null {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds <= 0) return null;
  return new Date(seconds * 1000).toISOString();
}

/** Non-sensitive one-line description of a BTCPay failure for the log. */
function describeBtcpayError(err: unknown): string {
  if (err instanceof BtcpayTimeoutError) return 'btcpay=timeout';
  if (err instanceof BtcpayApiError) return `btcpayStatus=${err.status}`;
  return `btcpay=unexpected(${err instanceof Error ? err.name : typeof err})`;
}
