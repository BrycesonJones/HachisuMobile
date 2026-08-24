// Edge Function: create-btcpay-invoice
//
// Creates a real BTCPay invoice for the authenticated merchant's ACTIVE store,
// records the minimum useful metadata in Supabase, and returns a normalized
// Hachisu invoice model to the mobile app.
//
// Security model (identical in shape to the Pay Button functions):
//   * The client sends only Hachisu's internal merchantStoreId. It may NOT send
//     a btcpay_store_id, a Greenfield key, a wallet descriptor, an xpub, or an
//     invoice status — every one of those is resolved or decided server-side.
//   * The Greenfield key never leaves this process and is never logged.
//   * The store row is read with the service role and ownership is verified in
//     code (store.user_id === auth user id). A store that exists but belongs to
//     someone else returns the SAME 404 as a store that does not exist, so this
//     endpoint cannot be used to probe for other merchants' stores.
//
// Ordering (matters for correctness):
//   validate -> resolve store -> resolve BTCPay methods -> claim idempotency ->
//   create in BTCPay -> persist -> respond
// A BTCPay failure must never leave a Supabase-only "phantom" invoice, and a
// Supabase failure after BTCPay succeeded must never be reported as a plain
// failure (that would invite the merchant to create a duplicate).
//
// Required secrets: BTCPAY_SERVER_URL, BTCPAY_GREENFIELD_API_KEY.
// Platform-provided: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.

import { createClient } from 'jsr:@supabase/supabase-js@2';

import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import {
  BtcpayApiError,
  BtcpayConfigError,
  BtcpayTimeoutError,
  createStoreInvoice,
  getBtcpayConfig,
  listStoreEnabledPaymentMethods,
  sanitizeCheckoutLink,
  type BtcpayInvoice,
  type CreateInvoiceMetadata,
} from '../_shared/btcpay-client.ts';
import { normalizeBtcpayPaymentMethod, type PaymentRail } from '../_shared/payment-method.ts';
import {
  MAX_DESCRIPTION_LENGTH,
  MAX_ORDER_ID_LENGTH,
  validateAmount,
  validateCurrency,
  validateExpirationMinutes,
  validateIdempotencyKey,
  validateOptionalEmail,
  validateOptionalText,
  type InvoiceInputError,
} from '../_shared/invoice-input.ts';

/** Rails the merchant can choose in the app. Mirrors TransactionCurrencySelection. */
type RequestedRail = 'onchain' | 'lightning';

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
  | 'NO_PAYMENT_METHOD_AVAILABLE'
  | 'PAYMENT_METHOD_LOOKUP_FAILED'
  | 'BTCPAY_INVOICE_CREATE_FAILED'
  | 'INVALID_BTCPAY_RESPONSE'
  | 'INVOICE_CREATED_SYNC_FAILED'
  | 'INVOICE_CREATE_IN_PROGRESS'
  | 'SERVER_ERROR';

interface StoreRow {
  id: string;
  user_id: string;
  btcpay_store_id: string | null;
  name: string;
  default_currency: string;
}

/** A stale in-flight claim is one whose request provably cannot still be running.
 * Supabase caps an edge function's wall-clock far below this, so a claim older
 * than the window belongs to a dead request. It is still not auto-superseded —
 * see the note where it is used. */
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
  if (!idempotency.ok) return inputError(idempotency);
  const idempotencyKey = idempotency.value;

  const requestedRails = readRequestedRails(body.paymentRails);
  if (requestedRails.length === 0) {
    return errorResponse(
      'INVALID_REQUEST',
      'Select at least one transaction currency.',
      400,
    );
  }

  const description = validateOptionalText(
    body.description,
    MAX_DESCRIPTION_LENGTH,
    'Item description',
  );
  if (!description.ok) return inputError(description);

  const orderId = validateOptionalText(body.orderId, MAX_ORDER_ID_LENGTH, 'Order ID');
  if (!orderId.ok) return inputError(orderId);

  const buyerEmail = validateOptionalEmail(body.buyerEmail, 'buyer email');
  if (!buyerEmail.ok) return inputError(buyerEmail);

  const expirationMinutes = validateExpirationMinutes(body.expirationMinutes);
  if (!expirationMinutes.ok) return inputError(expirationMinutes);

  const amount = validateAmount(body.amount);
  if (!amount.ok) return inputError(amount);

  // --- 3. Resolve the store + verify ownership ----------------------------
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const { data: store, error: storeError } = await admin
    .from('merchant_stores')
    .select('id, user_id, btcpay_store_id, name, default_currency')
    .eq('id', merchantStoreId)
    .maybeSingle<StoreRow>();
  if (storeError) {
    console.error(`[invoice:create] user=${user.id} store lookup failed:`, storeError.message);
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

  // Currency is resolved AFTER the store is known so an omitted client value
  // falls back to this store's configured currency, never a global default.
  const currency = validateCurrency(body.currency, store.default_currency);
  if (!currency.ok) return inputError(currency);

  let config;
  try {
    config = getBtcpayConfig();
  } catch (err) {
    const message = err instanceof BtcpayConfigError ? err.message : 'BTCPay is not configured.';
    return errorResponse('SERVER_ERROR', message, 500);
  }

  const logPrefix =
    `[invoice:create] user=${user.id} store=${store.id} btcpayStore=${btcpayStoreId} ` +
    `key=${idempotencyKey}`;

  // --- 4. Idempotency: return the prior invoice, or claim this attempt -----
  //
  // The unique index on (merchant_store_id, idempotency_key) — not the disabled
  // button in the app — is what actually prevents a double tap or a retried
  // request from creating two BTCPay invoices.
  const existing = await readClaim(admin, store.id, idempotencyKey);
  if (existing === 'error') {
    return errorResponse('SERVER_ERROR', 'Could not check for an existing invoice.', 500);
  }
  if (existing) {
    if (existing.btcpay_invoice_id) {
      console.log(`${logPrefix} result=INVOICE_ALREADY_CREATED invoice=${existing.btcpay_invoice_id}`);
      return jsonResponse({
        ok: true,
        reused: true,
        invoice: invoiceFromRow(existing, store.id),
      });
    }
    // A claim with no invoice id: either a request is running right now, or one
    // died mid-flight. Either way we must NOT create a second invoice for this
    // attempt — BTCPay may already hold one we never recorded. This never wedges
    // the merchant: a fresh submission carries a NEW key, and the invoice (if it
    // exists) is visible in Activity, which reads BTCPay directly.
    const ageMs = Date.now() - new Date(existing.created_at).getTime();
    console.log(`${logPrefix} result=INVOICE_CREATE_IN_PROGRESS ageMs=${ageMs}`);
    return errorResponse(
      'INVOICE_CREATE_IN_PROGRESS',
      ageMs > CLAIM_STALE_MS
        ? 'A previous attempt for this invoice did not finish. Check Activity before creating it again.'
        : 'This invoice is already being created.',
      409,
    );
  }

  // --- 5. Resolve the payment methods BTCPay will actually expose ---------
  //
  // BTCPay owns this configuration, so it is read from BTCPay rather than
  // inferred from Hachisu's cached onchain_status/lightning_status columns.
  let enabledMethodIds: string[];
  try {
    const methods = await listStoreEnabledPaymentMethods(config, btcpayStoreId, {
      timeoutMs: 10_000,
    });
    enabledMethodIds = methods.map((m) => m.paymentMethodId);
  } catch (err) {
    // A lookup FAILURE is never treated as "no payment methods" — that would
    // turn a transient BTCPay blip into a misleading setup error.
    console.error(`${logPrefix} result=PAYMENT_METHOD_LOOKUP_FAILED ${describeBtcpayError(err)}`);
    return errorResponse(
      'PAYMENT_METHOD_LOOKUP_FAILED',
      'Could not check this store’s payment methods right now. Try again.',
      502,
    );
  }

  const railOf = new Map<string, PaymentRail>();
  for (const id of enabledMethodIds) {
    railOf.set(id, normalizeBtcpayPaymentMethod(id, null).paymentRail);
  }
  const selectedMethodIds = enabledMethodIds.filter((id) => {
    const rail = railOf.get(id);
    return rail === 'onchain' || rail === 'lightning'
      ? requestedRails.includes(rail)
      : false;
  });

  if (selectedMethodIds.length === 0) {
    const availableRails = [...new Set([...railOf.values()])].join(',') || 'none';
    console.log(
      `${logPrefix} result=NO_PAYMENT_METHOD_AVAILABLE requested=${requestedRails.join(',')} ` +
        `storeEnabled=${enabledMethodIds.join(',') || 'none'} rails=${availableRails}`,
    );
    return errorResponse(
      'NO_PAYMENT_METHOD_AVAILABLE',
      enabledMethodIds.length === 0
        ? 'Set up a Bitcoin payment method before creating an invoice.'
        : 'The selected transaction currencies are not enabled for this store yet.',
      409,
      { storeEnabledRails: [...new Set([...railOf.values()])].filter((r) => r !== 'unknown') },
    );
  }

  // Only constrain the checkout when the merchant asked for a SUBSET. Sending
  // every enabled id would freeze the invoice against a later store change, so
  // BTCPay stays authoritative in the common "all methods" case.
  const constrainMethods = selectedMethodIds.length < enabledMethodIds.length;

  // --- 6. Claim the attempt BEFORE calling BTCPay -------------------------
  const claimed = await insertClaim(admin, {
    user_id: user.id,
    merchant_store_id: store.id,
    btcpay_store_id: btcpayStoreId,
    idempotency_key: idempotencyKey,
    amount: amount.value,
    currency: currency.value,
    description: description.value,
    order_id: orderId.value,
    buyer_email: buyerEmail.value,
    requested_payment_rails: requestedRails,
  });
  if (claimed === 'duplicate') {
    // Lost the race against a concurrent request carrying the same key — that
    // request owns the creation. Reporting in-progress here is what makes the
    // double-tap guarantee real rather than advisory.
    console.log(`${logPrefix} result=INVOICE_CREATE_IN_PROGRESS reason=claim_race`);
    return errorResponse('INVOICE_CREATE_IN_PROGRESS', 'This invoice is already being created.', 409);
  }
  if (claimed === 'error') {
    return errorResponse('SERVER_ERROR', 'Could not start invoice creation.', 500);
  }

  // --- 7. Create the invoice in BTCPay ------------------------------------
  const metadata: CreateInvoiceMetadata = { hachisuSource: 'invoice' };
  if (orderId.value) metadata.orderId = orderId.value;
  if (description.value) metadata.itemDesc = description.value;
  if (buyerEmail.value) metadata.buyerEmail = buyerEmail.value;

  let invoice: BtcpayInvoice;
  try {
    invoice = await createStoreInvoice(config, btcpayStoreId, {
      amount: amount.value,
      currency: currency.value,
      metadata,
      checkout: {
        ...(constrainMethods ? { paymentMethods: selectedMethodIds } : {}),
        ...(expirationMinutes.value != null
          ? { expirationMinutes: expirationMinutes.value }
          : {}),
      },
      ...(orderId.value ? { additionalSearchTerms: [orderId.value] } : {}),
    });
  } catch (err) {
    // BTCPay did NOT create an invoice -> remove the claim so this same attempt
    // can be retried, and never leave a Supabase-only invoice behind.
    await releaseClaim(admin, store.id, idempotencyKey);
    const detail = describeBtcpayError(err);
    console.error(`${logPrefix} result=BTCPAY_INVOICE_CREATE_FAILED ${detail} durationMs=${Date.now() - startedAt}`);

    if (err instanceof BtcpayApiError && err.status === 403) {
      return errorResponse(
        'BTCPAY_INVOICE_CREATE_FAILED',
        'Hachisu is not permitted to create invoices for this store.',
        502,
      );
    }
    return errorResponse(
      'BTCPAY_INVOICE_CREATE_FAILED',
      'Invoice could not be created right now. Try again.',
      502,
    );
  }

  // BTCPay's own values are authoritative from here on — the status is NEVER
  // assumed to be "New" just because the create call returned 200.
  const btcpayStatus = typeof invoice.status === 'string' ? invoice.status : null;
  const createdAt = unixToIso(invoice.createdTime) ?? new Date().toISOString();
  const expiresAt = unixToIso(invoice.expirationTime);
  // Origin-checked against the configured BTCPay server: the merchant will share
  // this link with a paying customer, so it must provably belong to our BTCPay.
  const checkoutUrl = sanitizeCheckoutLink(invoice.checkoutLink, config.serverUrl);
  const btcpayAmount = typeof invoice.amount === 'string' ? invoice.amount : amount.value;
  const btcpayCurrency = typeof invoice.currency === 'string' ? invoice.currency : currency.value;
  const availableRails = railsFromInvoice(invoice, selectedMethodIds);

  // --- 8. Persist (idempotent on merchant_store_id + btcpay_invoice_id) ---
  const { error: syncError } = await admin
    .from('merchant_invoices')
    .update({
      btcpay_invoice_id: invoice.id,
      sync_status: 'created',
      btcpay_status: btcpayStatus,
      checkout_link: checkoutUrl,
      amount: btcpayAmount,
      currency: btcpayCurrency,
      expires_at: expiresAt,
    })
    .eq('merchant_store_id', store.id)
    .eq('idempotency_key', idempotencyKey);

  const durationMs = Date.now() - startedAt;

  if (syncError) {
    // The invoice EXISTS in BTCPay. Reporting a plain failure here would invite
    // the merchant to create a duplicate, so the outcome is reported distinctly
    // and the authoritative id is returned for recovery. Activity reads BTCPay
    // directly, so the invoice is still visible and payable regardless.
    console.error(
      `${logPrefix} result=INVOICE_CREATED_SYNC_FAILED invoice=${invoice.id} ` +
        `status=${btcpayStatus} dbError=${syncError.message} durationMs=${durationMs}`,
    );
    // Best-effort: mark the claim so a later reconciliation can find it.
    await admin
      .from('merchant_invoices')
      .update({ sync_status: 'sync_failed', btcpay_status: btcpayStatus })
      .eq('merchant_store_id', store.id)
      .eq('idempotency_key', idempotencyKey);

    return jsonResponse(
      {
        ok: false,
        code: 'INVOICE_CREATED_SYNC_FAILED' satisfies ResultCode,
        error:
          'The invoice was created, but Hachisu could not finish syncing it. ' +
          'Do not create another invoice yet.',
        invoice: {
          merchantStoreId: store.id,
          btcpayInvoiceId: invoice.id,
          status: btcpayStatus,
          amount: btcpayAmount,
          currency: btcpayCurrency,
          description: description.value,
          orderId: orderId.value,
          createdAt,
          expiresAt,
          checkoutUrl,
          paymentMethodsAvailable: availableRails,
        },
      },
      207,
    );
  }

  console.log(
    `${logPrefix} result=OK invoice=${invoice.id} status=${btcpayStatus} ` +
      `currency=${btcpayCurrency} rails=${availableRails.join(',') || 'none'} ` +
      `constrained=${constrainMethods} buyerEmail=${buyerEmail.value ? 'set' : 'unset'} ` +
      `checkoutUrl=${checkoutUrl ? 'resolved' : 'unavailable'} ` +
      `durationMs=${durationMs}`,
  );

  return jsonResponse({
    ok: true,
    reused: false,
    invoice: {
      merchantStoreId: store.id,
      btcpayInvoiceId: invoice.id,
      status: btcpayStatus,
      amount: btcpayAmount,
      currency: btcpayCurrency,
      description: description.value,
      orderId: orderId.value,
      createdAt,
      expiresAt,
      checkoutUrl,
      paymentMethodsAvailable: availableRails,
    },
  });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function inputError(err: { ok: false } & InvoiceInputError): Response {
  return errorResponse(err.code as ResultCode, err.message, 400);
}

/** Reads the merchant's requested rails. Unknown entries are ignored rather than
 * silently widening the invoice to a rail the merchant did not choose. */
function readRequestedRails(raw: unknown): RequestedRail[] {
  if (!Array.isArray(raw)) return [];
  const out = new Set<RequestedRail>();
  for (const entry of raw) {
    if (entry === 'onchain' || entry === 'lightning') out.add(entry);
  }
  return [...out];
}

interface ClaimRow {
  id: string;
  btcpay_invoice_id: string | null;
  btcpay_status: string | null;
  amount: string | number;
  currency: string;
  description: string | null;
  order_id: string | null;
  checkout_link: string | null;
  created_at: string;
  expires_at: string | null;
  requested_payment_rails: string[] | null;
}

const CLAIM_COLUMNS =
  'id, btcpay_invoice_id, btcpay_status, amount, currency, description, order_id, ' +
  'checkout_link, created_at, expires_at, requested_payment_rails';

async function readClaim(
  admin: ReturnType<typeof createClient>,
  merchantStoreId: string,
  idempotencyKey: string,
): Promise<ClaimRow | null | 'error'> {
  const { data, error } = await admin
    .from('merchant_invoices')
    .select(CLAIM_COLUMNS)
    .eq('merchant_store_id', merchantStoreId)
    .eq('idempotency_key', idempotencyKey)
    .maybeSingle<ClaimRow>();
  if (error) {
    console.error(`[invoice:create] claim read failed: ${error.message}`);
    return 'error';
  }
  return data ?? null;
}

async function insertClaim(
  admin: ReturnType<typeof createClient>,
  row: Record<string, unknown>,
): Promise<'ok' | 'duplicate' | 'error'> {
  const { error } = await admin
    .from('merchant_invoices')
    .insert({ ...row, sync_status: 'creating' });
  if (!error) return 'ok';
  // 23505 = unique_violation -> a concurrent request already claimed this key.
  if (error.code === '23505') return 'duplicate';
  console.error(`[invoice:create] claim insert failed: ${error.message}`);
  return 'error';
}

/** Removes an unfulfilled claim so the SAME attempt can be retried after a
 * BTCPay failure. Only ever deletes a row that has no BTCPay invoice attached. */
async function releaseClaim(
  admin: ReturnType<typeof createClient>,
  merchantStoreId: string,
  idempotencyKey: string,
): Promise<void> {
  const { error } = await admin
    .from('merchant_invoices')
    .delete()
    .eq('merchant_store_id', merchantStoreId)
    .eq('idempotency_key', idempotencyKey)
    .is('btcpay_invoice_id', null);
  if (error) {
    console.error(`[invoice:create] claim release failed: ${error.message}`);
  }
}

function invoiceFromRow(row: ClaimRow, merchantStoreId: string) {
  return {
    merchantStoreId,
    btcpayInvoiceId: row.btcpay_invoice_id,
    status: row.btcpay_status,
    amount: typeof row.amount === 'string' ? row.amount : String(row.amount),
    currency: row.currency,
    description: row.description,
    orderId: row.order_id,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    checkoutUrl: row.checkout_link,
    paymentMethodsAvailable: (row.requested_payment_rails ?? []).filter(
      (r): r is RequestedRail => r === 'onchain' || r === 'lightning',
    ),
  };
}

/** Rails the created invoice actually exposes, per BTCPay's echoed checkout when
 * present, otherwise the ids we constrained it to. Never guessed. */
function railsFromInvoice(invoice: BtcpayInvoice, fallbackIds: string[]): RequestedRail[] {
  const echoed = invoice.checkout?.paymentMethods;
  const ids = Array.isArray(echoed) && echoed.length > 0
    ? echoed.filter((v): v is string => typeof v === 'string')
    : fallbackIds;
  const rails = new Set<RequestedRail>();
  for (const id of ids) {
    const rail = normalizeBtcpayPaymentMethod(id, null).paymentRail;
    if (rail === 'onchain' || rail === 'lightning') rails.add(rail);
  }
  return [...rails];
}

function unixToIso(seconds: unknown): string | null {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds <= 0) return null;
  return new Date(seconds * 1000).toISOString();
}

/** Non-sensitive one-line description of a BTCPay failure for the log. Never
 * includes the Greenfield key or a response body that could carry one. */
function describeBtcpayError(err: unknown): string {
  if (err instanceof BtcpayTimeoutError) return 'btcpay=timeout';
  if (err instanceof BtcpayApiError) return `btcpayStatus=${err.status}`;
  return `btcpay=unexpected(${err instanceof Error ? err.name : typeof err})`;
}
