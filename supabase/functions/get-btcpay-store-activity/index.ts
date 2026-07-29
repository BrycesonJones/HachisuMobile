// Edge Function: get-btcpay-store-activity
//
// Powers the mobile Activity feed. BTCPay Server is the payment/reporting source
// of truth; this function is the ONLY path the mobile app uses to read it (the app
// never calls BTCPay directly and never sees the Greenfield key or the BTCPay
// store id it can influence).
//
// Flow:
//   1. Authenticate the caller (JWT -> getUser).
//   2. Verify the caller OWNS merchantStoreId (server-side, service role).
//   3. Resolve btcpay_store_id from the owned row (never trust a client value).
//   4. List the store's invoices for the requested range via Greenfield.
//   5. Best-effort enrich each invoice with its crypto amount + received date.
//   6. Normalize into mobile-friendly Activity items and return them.
//
// Payload: { merchantStoreId, startDate?, endDate?, tab?, limit?, offset? }
// Required secrets: BTCPAY_SERVER_URL, BTCPAY_GREENFIELD_API_KEY.
// Platform-provided: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.

import { createClient } from 'jsr:@supabase/supabase-js@2';

import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import {
  BtcpayApiError,
  BtcpayConfigError,
  getBtcpayConfig,
  getInvoicePaymentMethods,
  listStoreInvoices,
  type BtcpayConfig,
  type BtcpayInvoice,
  type BtcpayInvoicePaymentMethod,
} from '../_shared/btcpay-client.ts';

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;
const DEFAULT_RANGE_DAYS = 30;
// Cap how many invoices we enrich with a per-invoice payment-methods call, so a
// large page never fans out into hundreds of extra requests.
const MAX_ENRICH = 25;

type NormalizedStatus =
  | 'new'
  | 'processing'
  | 'settled'
  | 'expired'
  | 'invalid'
  | 'failed';
type DisplayStatus =
  | 'Pending'
  | 'Processing'
  | 'Paid'
  | 'Settled'
  | 'Expired'
  | 'Failed';
type PaymentMethod = 'BTC' | 'BTC-LN' | 'unknown';
type SourceFeature = 'pay_button' | 'invoice' | 'pos' | 'request' | 'unknown';

interface ActivityItem {
  id: string;
  type: 'invoice';
  btcpayInvoiceId: string;
  status: NormalizedStatus;
  displayStatus: DisplayStatus;
  amount: string;
  currency: string;
  btcAmount: string | null;
  paymentMethod: PaymentMethod;
  title: string;
  description: string | null;
  orderId: string | null;
  createdAt: string;
  paidAt: string | null;
  settledAt: string | null;
  checkoutUrl: string | null;
  sourceFeature: SourceFeature;
  rawStatus: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ ok: false, error: 'Method not allowed' }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return jsonResponse({ ok: false, error: 'Server is not configured.' }, 500);
  }

  // 1. Authenticate.
  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) {
    return jsonResponse({ ok: false, error: 'Missing or invalid Authorization header.' }, 401);
  }
  const userScoped = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const {
    data: { user },
    error: userError,
  } = await userScoped.auth.getUser();
  if (userError || !user) {
    return jsonResponse({ ok: false, error: 'Not authenticated.' }, 401);
  }

  // Parse + validate the payload.
  let body: {
    merchantStoreId?: unknown;
    startDate?: unknown;
    endDate?: unknown;
    tab?: unknown;
    limit?: unknown;
    offset?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ ok: false, error: 'Invalid JSON body.' }, 400);
  }

  const merchantStoreId =
    typeof body.merchantStoreId === 'string' ? body.merchantStoreId.trim() : '';
  if (!merchantStoreId) {
    return jsonResponse({ ok: false, error: 'merchantStoreId is required.' }, 400);
  }

  const limit = clampInt(body.limit, DEFAULT_LIMIT, 1, MAX_LIMIT);
  const offset = clampInt(body.offset, 0, 0, Number.MAX_SAFE_INTEGER);

  // Resolve the date range (default: last 30 days). Range is inclusive; endDate
  // defaults to "now" so newly created invoices are always in range.
  const now = new Date();
  const endDate = parseDate(body.endDate) ?? now;
  const defaultStart = new Date(endDate.getTime() - DEFAULT_RANGE_DAYS * 86_400_000);
  const startDate = parseDate(body.startDate) ?? defaultStart;

  // 2. Verify ownership + 3. resolve btcpay_store_id server-side.
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });
  const { data: store, error: storeError } = await admin
    .from('merchant_stores')
    .select('id, user_id, btcpay_store_id, name')
    .eq('id', merchantStoreId)
    .maybeSingle<{ id: string; user_id: string; btcpay_store_id: string; name: string }>();
  if (storeError) {
    return jsonResponse({ ok: false, error: 'Could not load the store.' }, 500);
  }
  if (!store || store.user_id !== user.id) {
    return jsonResponse({ ok: false, error: 'Store not found.' }, 404);
  }
  if (!store.btcpay_store_id) {
    return jsonResponse(
      { ok: false, error: 'This store is not connected to BTCPay yet.' },
      409,
    );
  }

  let config: BtcpayConfig;
  try {
    config = getBtcpayConfig();
  } catch (err) {
    const message =
      err instanceof BtcpayConfigError ? err.message : 'BTCPay is not configured.';
    return jsonResponse({ ok: false, error: message }, 500);
  }

  const range = {
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
  };

  try {
    // 4. List invoices for the range (BTCPay expects unix seconds).
    const invoices = await listStoreInvoices(config, store.btcpay_store_id, {
      startDate: Math.floor(startDate.getTime() / 1000),
      endDate: Math.floor(endDate.getTime() / 1000),
      skip: offset,
      take: limit,
    });

    // 5. Best-effort enrichment (crypto amount + received/settled dates). Bounded
    // and concurrent; a single failure resolves to no enrichment for that invoice.
    const enrichable = invoices.slice(0, MAX_ENRICH);
    const paymentMethodsByInvoice = new Map<string, BtcpayInvoicePaymentMethod[]>();
    await Promise.all(
      enrichable.map(async (invoice) => {
        if (!invoice.id) return;
        try {
          const methods = await getInvoicePaymentMethods(
            config,
            store.btcpay_store_id,
            invoice.id,
          );
          paymentMethodsByInvoice.set(invoice.id, methods);
        } catch {
          // Network failure enriching one invoice — leave it un-enriched.
        }
      }),
    );

    // 6. Normalize.
    const items = invoices.map((invoice) =>
      normalizeInvoice(invoice, paymentMethodsByInvoice.get(invoice.id ?? '') ?? []),
    );

    // Pagination: if we filled the page, there may be more.
    const nextOffset = invoices.length === limit ? offset + limit : null;

    console.log(
      `[store-activity] user=${user.id} store=${store.id} btcpayStore=${store.btcpay_store_id} ` +
        `range=${range.startDate}..${range.endDate} limit=${limit} offset=${offset} ` +
        `returned=${items.length} nextOffset=${nextOffset ?? 'null'}`,
    );

    return jsonResponse({
      ok: true,
      merchantStoreId: store.id,
      btcpayStoreId: store.btcpay_store_id,
      source: 'btcpay',
      range,
      items,
      nextOffset,
    });
  } catch (err) {
    const isApiError = err instanceof BtcpayApiError;
    let message = 'Could not load activity. Please try again.';
    if (isApiError && (err.status === 401 || err.status === 403)) {
      message = 'BTCPay rejected the request (permission denied).';
    }
    console.error(
      `[store-activity] user=${user.id} store=${store.id} btcpayStore=${store.btcpay_store_id} ` +
        `failed: ${isApiError ? `HTTP ${err.status}` : String(err)}`,
    );
    return jsonResponse({ ok: false, error: message }, 502);
  }
});

// ---------------------------------------------------------------------------
// Normalization helpers
// ---------------------------------------------------------------------------

function normalizeInvoice(
  invoice: BtcpayInvoice,
  methods: BtcpayInvoicePaymentMethod[],
): ActivityItem {
  const rawStatus = typeof invoice.status === 'string' ? invoice.status : 'Unknown';
  const status = normalizeStatus(rawStatus);
  const displayStatus = toDisplayStatus(status);

  const metadata = (invoice.metadata ?? {}) as Record<string, unknown>;
  const orderId = strOrNull(metadata.orderId);
  const itemDesc = strOrNull(metadata.itemDesc);
  const source = deriveSourceFeature(invoice, metadata, orderId);

  const { paymentMethod, btcAmount, paidAt } = summarizePayments(invoice, methods);
  const createdAt = unixToIso(invoice.createdTime) ?? new Date().toISOString();
  const settledAt = status === 'settled' ? paidAt : null;

  return {
    id: invoice.id,
    type: 'invoice',
    btcpayInvoiceId: invoice.id,
    status,
    displayStatus,
    amount: typeof invoice.amount === 'string' ? invoice.amount : '0',
    currency: typeof invoice.currency === 'string' ? invoice.currency : 'USD',
    btcAmount,
    paymentMethod,
    title: titleForSource(source),
    description: itemDesc,
    orderId,
    createdAt,
    paidAt,
    settledAt,
    checkoutUrl: strOrNull(invoice.checkoutLink),
    sourceFeature: source,
    rawStatus,
  };
}

function normalizeStatus(raw: string): NormalizedStatus {
  switch (raw.toLowerCase()) {
    case 'new':
      return 'new';
    case 'processing':
    case 'paid': // legacy: seen-but-unconfirmed
      return 'processing';
    case 'settled':
    case 'complete': // legacy
    case 'confirmed': // legacy
      return 'settled';
    case 'expired':
      return 'expired';
    case 'invalid':
      return 'invalid';
    default:
      return 'failed';
  }
}

function toDisplayStatus(status: NormalizedStatus): DisplayStatus {
  switch (status) {
    case 'new':
      return 'Pending';
    case 'processing':
      return 'Processing';
    case 'settled':
      return 'Settled';
    case 'expired':
      return 'Expired';
    case 'invalid':
    case 'failed':
      return 'Failed';
  }
}

/** Best-effort detection of which feature created the invoice. Pay Button and a
 * manually created invoice are indistinguishable in Greenfield metadata, so the
 * generic case is reported as 'unknown' rather than guessed. */
function deriveSourceFeature(
  invoice: BtcpayInvoice,
  metadata: Record<string, unknown>,
  orderId: string | null,
): SourceFeature {
  if (metadata.paymentRequestId != null) return 'request';
  if (
    metadata.appId != null ||
    metadata.posData != null ||
    (orderId != null && orderId.toLowerCase().startsWith('pos'))
  ) {
    return 'pos';
  }
  return 'unknown';
}

function titleForSource(source: SourceFeature): string {
  switch (source) {
    case 'request':
      return 'Payment Request';
    case 'pos':
      return 'Point of Sale';
    case 'pay_button':
      return 'Pay Button payment';
    case 'invoice':
      return 'Invoice';
    case 'unknown':
      return 'Payment';
  }
}

/** Picks the crypto amount, method, and earliest received date across payment
 * methods. Tolerant of field-name differences between BTCPay versions. */
function summarizePayments(
  invoice: BtcpayInvoice,
  methods: BtcpayInvoicePaymentMethod[],
): { paymentMethod: PaymentMethod; btcAmount: string | null; paidAt: string | null } {
  let paymentMethod: PaymentMethod = 'unknown';
  let btcAmount: string | null = null;
  let earliestReceived: number | null = null;

  for (const method of methods) {
    const id = String(
      method.paymentMethodId ?? method.paymentMethod ?? method.cryptoCode ?? '',
    );
    const payments = Array.isArray(method.payments) ? method.payments : [];
    const paid = toNumber(method.totalPaid) ?? toNumber(method.paymentMethodPaid) ?? 0;

    // Prefer the method that actually received funds; otherwise take the first.
    const hasFunds = paid > 0 || payments.length > 0;
    if (hasFunds || paymentMethod === 'unknown') {
      const normalizedId = normalizePaymentMethodId(id);
      if (normalizedId !== 'unknown') paymentMethod = normalizedId;
      const cryptoPaid = paid > 0 ? method.totalPaid ?? method.paymentMethodPaid : method.amount;
      if (cryptoPaid != null && String(cryptoPaid) !== '') btcAmount = String(cryptoPaid);
    }

    for (const payment of payments) {
      const received = typeof payment.receivedDate === 'number' ? payment.receivedDate : null;
      if (received != null && (earliestReceived == null || received < earliestReceived)) {
        earliestReceived = received;
      }
    }
  }

  // Fall back to the invoice's enabled methods when nothing was paid yet.
  if (paymentMethod === 'unknown') {
    const enabled = invoice.checkout?.paymentMethods;
    if (Array.isArray(enabled) && enabled.length === 1) {
      paymentMethod = normalizePaymentMethodId(enabled[0]);
    }
  }

  return {
    paymentMethod,
    btcAmount,
    paidAt: unixToIso(earliestReceived ?? undefined),
  };
}

function normalizePaymentMethodId(id: string): PaymentMethod {
  const upper = id.toUpperCase();
  if (upper.includes('LN') || upper.includes('LIGHTNING')) return 'BTC-LN';
  if (upper.includes('BTC') || upper.includes('CHAIN')) return 'BTC';
  return 'unknown';
}

// ---------------------------------------------------------------------------
// Small utilities
// ---------------------------------------------------------------------------

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  const n =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim() !== ''
        ? Number(value)
        : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

/** Parses an ISO date string (or unix-seconds number) to a Date, or null. */
function parseDate(value: unknown): Date | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Date(value * 1000);
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return null;
}

function unixToIso(seconds: number | undefined): string | null {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds)) return null;
  return new Date(seconds * 1000).toISOString();
}

function strOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

function toNumber(value: unknown): number | null {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(n) ? n : null;
}
