// Server-side BTCPay Server Greenfield API client.
//
// SECURITY: this module reads BTCPAY_GREENFIELD_API_KEY from the function
// environment. That key MUST live only here (server side). It is never returned
// to the client, never logged, and never persisted to the database.
//
// Greenfield reference: https://docs.btcpayserver.org/API/Greenfield/v1/
//   POST /api/v1/stores   (requires permission btcpay.store.canmodifystoresettings)
//   Auth header:          Authorization: token <api-key>
//   Body (min):           { "name": string, "defaultCurrency"?: string }
//   Response (StoreData):  { "id": string, "name": string, ... }

export interface BtcpayConfig {
  serverUrl: string;
  apiKey: string;
}

/**
 * Reads and validates BTCPay env vars. Throws a safe (key-free) error when
 * either is missing so the function can return a graceful 500 without leaking
 * which secret is absent in a way that exposes its value.
 */
export function getBtcpayConfig(): BtcpayConfig {
  const serverUrl = Deno.env.get('BTCPAY_SERVER_URL');
  const apiKey = Deno.env.get('BTCPAY_GREENFIELD_API_KEY');

  const missing: string[] = [];
  if (!serverUrl) missing.push('BTCPAY_SERVER_URL');
  if (!apiKey) missing.push('BTCPAY_GREENFIELD_API_KEY');

  if (missing.length > 0) {
    throw new BtcpayConfigError(
      `BTCPay is not configured on the server (missing: ${missing.join(', ')}).`,
    );
  }

  // Normalize: strip a trailing slash so `${serverUrl}/api/...` is well-formed.
  return {
    serverUrl: serverUrl!.replace(/\/+$/, ''),
    apiKey: apiKey!,
  };
}

export class BtcpayConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BtcpayConfigError';
  }
}

export class BtcpayApiError extends Error {
  readonly status: number;
  /** Parsed (or raw text) body from BTCPay, safe to store as raw_error. */
  readonly body: unknown;

  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = 'BtcpayApiError';
    this.status = status;
    this.body = body;
  }
}

export interface BtcpayStore {
  id: string;
  name: string;
  /** Whatever else Greenfield returns; kept loose so we don't fight the schema. */
  [key: string]: unknown;
}

export interface CreateStoreInput {
  name: string;
  /** Greenfield defaults to USD when omitted. */
  defaultCurrency?: string;
}

/**
 * Creates a new BTCPay store via the Greenfield API and returns the created
 * store. Throws BtcpayApiError on a non-2xx response (body captured for audit).
 */
export async function createStore(
  config: BtcpayConfig,
  input: CreateStoreInput,
): Promise<BtcpayStore> {
  const body: Record<string, unknown> = { name: input.name };
  if (input.defaultCurrency) body.defaultCurrency = input.defaultCurrency;

  let response: Response;
  try {
    response = await fetch(`${config.serverUrl}/api/v1/stores`, {
      method: 'POST',
      headers: {
        Authorization: `token ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  } catch (cause) {
    // Network / DNS / TLS failure reaching BTCPay.
    throw new BtcpayApiError(
      `Could not reach BTCPay Server at ${config.serverUrl}.`,
      0,
      { cause: String(cause) },
    );
  }

  const rawText = await response.text();
  let parsed: unknown = rawText;
  try {
    parsed = rawText ? JSON.parse(rawText) : null;
  } catch {
    // Leave parsed as the raw text.
  }

  if (!response.ok) {
    throw new BtcpayApiError(
      `BTCPay store creation failed (HTTP ${response.status}).`,
      response.status,
      parsed,
    );
  }

  const store = parsed as Partial<BtcpayStore> | null;
  if (!store || typeof store.id !== 'string') {
    throw new BtcpayApiError(
      'BTCPay returned an unexpected store payload (no id).',
      response.status,
      parsed,
    );
  }

  return store as BtcpayStore;
}

// ---------------------------------------------------------------------------
// Point of Sale apps
// ---------------------------------------------------------------------------
//
// Greenfield: POST /api/v1/stores/{storeId}/apps/pos
//   body (min): { appName }  (+ optional title, currency, defaultView, description)
//   defaultView enum: Static | Cart | Light | Print
//   Response (PointOfSaleAppData): { id, name, storeId, appType, ... }

export type PosDefaultView = 'Static' | 'Cart' | 'Light' | 'Print';

export interface CreatePosAppInput {
  appName: string;
  title?: string;
  currency?: string;
  defaultView?: PosDefaultView;
  description?: string;
}

export interface BtcpayPosApp {
  id: string;
  name?: string;
  storeId?: string;
  [key: string]: unknown;
}

/**
 * Creates a Point of Sale app under a BTCPay store. Throws BtcpayApiError on a
 * non-2xx response (body captured for diagnostics).
 */
export async function createPosApp(
  config: BtcpayConfig,
  btcpayStoreId: string,
  input: CreatePosAppInput,
): Promise<BtcpayPosApp> {
  const body: Record<string, unknown> = { appName: input.appName };
  if (input.title) body.title = input.title;
  if (input.currency) body.currency = input.currency;
  if (input.defaultView) body.defaultView = input.defaultView;
  if (input.description) body.description = input.description;

  let response: Response;
  try {
    response = await fetch(
      `${config.serverUrl}/api/v1/stores/${encodeURIComponent(btcpayStoreId)}/apps/pos`,
      {
        method: 'POST',
        headers: {
          Authorization: `token ${config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      },
    );
  } catch (cause) {
    throw new BtcpayApiError(
      `Could not reach BTCPay Server at ${config.serverUrl}.`,
      0,
      { cause: String(cause) },
    );
  }

  const rawText = await response.text();
  let parsed: unknown = rawText;
  try {
    parsed = rawText ? JSON.parse(rawText) : null;
  } catch {
    // Leave parsed as the raw text.
  }

  if (!response.ok) {
    throw new BtcpayApiError(
      `BTCPay POS app creation failed (HTTP ${response.status}).`,
      response.status,
      parsed,
    );
  }

  const app = parsed as Partial<BtcpayPosApp> | null;
  if (!app || typeof app.id !== 'string') {
    throw new BtcpayApiError(
      'BTCPay returned an unexpected POS app payload (no id).',
      response.status,
      parsed,
    );
  }

  return app as BtcpayPosApp;
}

export interface UpdatePosAppInput {
  title?: string;
  currency?: string;
  defaultView?: PosDefaultView;
  description?: string;
  /** BTCPay POS app template (JSON string of items). */
  template?: string;
}

/**
 * Updates a Point of Sale app (Greenfield: PUT /api/v1/apps/pos/{appId}). Only
 * the provided fields are sent. Throws BtcpayApiError on a non-2xx response.
 */
export async function updatePosApp(
  config: BtcpayConfig,
  btcpayAppId: string,
  input: UpdatePosAppInput,
): Promise<void> {
  const body: Record<string, unknown> = {};
  if (input.title !== undefined) body.title = input.title;
  if (input.currency) body.currency = input.currency;
  if (input.defaultView) body.defaultView = input.defaultView;
  if (input.description !== undefined) body.description = input.description;
  if (input.template !== undefined) body.template = input.template;

  let response: Response;
  try {
    response = await fetch(
      `${config.serverUrl}/api/v1/apps/pos/${encodeURIComponent(btcpayAppId)}`,
      {
        method: 'PUT',
        headers: {
          Authorization: `token ${config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      },
    );
  } catch (cause) {
    throw new BtcpayApiError(
      `Could not reach BTCPay Server at ${config.serverUrl}.`,
      0,
      { cause: String(cause) },
    );
  }

  if (response.ok) return;

  const rawText = await response.text();
  let parsed: unknown = rawText;
  try {
    parsed = rawText ? JSON.parse(rawText) : null;
  } catch {
    // Leave parsed as the raw text.
  }
  throw new BtcpayApiError(
    `BTCPay POS app update failed (HTTP ${response.status}).`,
    response.status,
    parsed,
  );
}

/**
 * Deletes a BTCPay app by id (Greenfield: DELETE /api/v1/apps/{appId}). A 404
 * is treated as success so the operation is idempotent (the app may already be
 * gone). Throws BtcpayApiError on other non-2xx responses.
 */
export async function deleteApp(config: BtcpayConfig, appId: string): Promise<void> {
  let response: Response;
  try {
    response = await fetch(
      `${config.serverUrl}/api/v1/apps/${encodeURIComponent(appId)}`,
      {
        method: 'DELETE',
        headers: { Authorization: `token ${config.apiKey}` },
      },
    );
  } catch (cause) {
    throw new BtcpayApiError(
      `Could not reach BTCPay Server at ${config.serverUrl}.`,
      0,
      { cause: String(cause) },
    );
  }

  if (response.ok || response.status === 404) return;

  const rawText = await response.text();
  let parsed: unknown = rawText;
  try {
    parsed = rawText ? JSON.parse(rawText) : null;
  } catch {
    // Leave parsed as the raw text.
  }
  throw new BtcpayApiError(
    `BTCPay app deletion failed (HTTP ${response.status}).`,
    response.status,
    parsed,
  );
}

// ---------------------------------------------------------------------------
// On-chain (Bitcoin) wallet configuration
// ---------------------------------------------------------------------------
//
// A merchant connects a store's on-chain wallet by submitting an extended public
// key (xpub/ypub/zpub/vpub/tpub) or an output descriptor. BTCPay (via NBXplorer)
// treats this as a "derivation scheme" and derives receive addresses from it — it
// is public-key material, never a private key or seed.
//
// Greenfield endpoints used:
//   POST /api/v1/stores/{storeId}/payment-methods/{pmId}/wallet/preview
//        body { derivationScheme }  -> { addresses: [{ keyPath, address }] }
//   PUT  /api/v1/stores/{storeId}/payment-methods/{pmId}
//        body { enabled, config: { derivationScheme, label } } -> GenericPaymentMethodData
//
// Payment method id: newer BTCPay uses "BTC-CHAIN"; older uses "BTC-OnChain". We
// try the modern id first and fall back so this works across instance versions.

const ONCHAIN_PAYMENT_METHOD_IDS = ['BTC-CHAIN', 'BTC-OnChain'] as const;

export interface PreviewAddress {
  keyPath: string;
  address: string;
}

/**
 * Masks an extended public key / descriptor for safe logging. Never log the
 * full value — it reveals a wallet's entire address history.
 * e.g. "zpub6r...wxyz" (first 6 + last 4).
 */
export function maskExtendedKey(value: string): string {
  const v = (value ?? '').trim();
  if (v.length <= 12) return '***';
  return `${v.slice(0, 6)}…${v.slice(-4)}`;
}

export interface DerivationClassification {
  /** merchant_stores.onchain_provider value ('xpub' | 'descriptor'). */
  provider: 'xpub' | 'descriptor';
  /** Non-sensitive human label for merchant_stores.onchain_address_type. */
  addressType: string;
}

/**
 * Best-effort classification of the supplied derivation input for non-sensitive
 * metadata only. Never throws; BTCPay remains the source of truth for validity.
 */
export function classifyDerivation(input: string): DerivationClassification {
  const v = (input ?? '').trim();
  const lower = v.toLowerCase();

  // Output descriptors contain a script-function call, e.g. wpkh(...), sh(wpkh(...)).
  if (v.includes('(')) {
    let addressType = 'Descriptor';
    if (lower.startsWith('tr(')) addressType = 'P2TR (Taproot)';
    else if (lower.startsWith('wpkh(')) addressType = 'P2WPKH (SegWit)';
    else if (lower.startsWith('sh(wpkh(')) addressType = 'P2SH-P2WPKH';
    else if (lower.startsWith('wsh(multi') || lower.startsWith('wsh(sortedmulti'))
      addressType = 'Multi-sig P2WSH';
    else if (lower.startsWith('sh(wsh(')) addressType = 'Multi-sig P2SH-P2WSH';
    else if (lower.startsWith('sh(multi') || lower.startsWith('sh(sortedmulti'))
      addressType = 'Multi-sig P2SH';
    else if (lower.startsWith('pkh(')) addressType = 'P2PKH (Legacy)';
    return { provider: 'descriptor', addressType };
  }

  // Bare extended keys: classify by SLIP-132 version prefix.
  const prefix = v.slice(0, 4).toLowerCase();
  let addressType = 'P2PKH (Legacy)';
  if (prefix === 'zpub' || prefix === 'vpub') addressType = 'P2WPKH (SegWit)';
  else if (prefix === 'ypub' || prefix === 'upub') addressType = 'P2SH-P2WPKH';
  // xpub / tpub default to legacy unless BTCPay reports otherwise.
  return { provider: 'xpub', addressType };
}

/**
 * Internal: call a wallet endpoint, trying each on-chain payment-method id until
 * one is accepted. Returns the parsed body of the first 2xx response. Throws the
 * last BtcpayApiError if every id fails.
 */
async function callOnChain(
  config: BtcpayConfig,
  btcpayStoreId: string,
  method: 'POST' | 'PUT',
  pathSuffix: string,
  body: Record<string, unknown>,
  query = '',
): Promise<unknown> {
  let lastError: BtcpayApiError | null = null;

  for (const pmId of ONCHAIN_PAYMENT_METHOD_IDS) {
    const url =
      `${config.serverUrl}/api/v1/stores/${encodeURIComponent(btcpayStoreId)}` +
      `/payment-methods/${pmId}${pathSuffix}${query}`;

    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers: {
          Authorization: `token ${config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
    } catch (cause) {
      throw new BtcpayApiError(
        `Could not reach BTCPay Server at ${config.serverUrl}.`,
        0,
        { cause: String(cause) },
      );
    }

    const rawText = await response.text();
    let parsed: unknown = rawText;
    try {
      parsed = rawText ? JSON.parse(rawText) : null;
    } catch {
      // Leave parsed as raw text.
    }

    if (response.ok) return parsed;

    // 404 (unknown payment method id) -> try the next id. Other 4xx (e.g. the
    // derivation scheme is invalid) are real errors; surface immediately.
    lastError = new BtcpayApiError(
      `BTCPay on-chain request failed (HTTP ${response.status}).`,
      response.status,
      parsed,
    );
    if (response.status !== 404) break;
  }

  throw lastError ??
    new BtcpayApiError('BTCPay on-chain request failed.', 0, null);
}

/**
 * Previews receive addresses BTCPay would derive from a proposed derivation
 * scheme WITHOUT saving it to the store. Used to let the merchant confirm their
 * wallet generates the same addresses.
 */
export async function previewOnChainWallet(
  config: BtcpayConfig,
  btcpayStoreId: string,
  derivationScheme: string,
  opts: { offset?: number; count?: number } = {},
): Promise<PreviewAddress[]> {
  const offset = opts.offset ?? 0;
  const count = opts.count ?? 10;
  const parsed = await callOnChain(
    config,
    btcpayStoreId,
    'POST',
    '/wallet/preview',
    { derivationScheme },
    `?offset=${offset}&count=${count}`,
  );

  const addresses = (parsed as { addresses?: unknown })?.addresses;
  if (!Array.isArray(addresses)) {
    throw new BtcpayApiError(
      'BTCPay returned an unexpected preview payload (no addresses).',
      200,
      parsed,
    );
  }

  return addresses.map((a) => ({
    keyPath: String((a as PreviewAddress)?.keyPath ?? ''),
    address: String((a as PreviewAddress)?.address ?? ''),
  }));
}

export interface OnChainConfigResult {
  enabled: boolean;
  [key: string]: unknown;
}

/**
 * Saves (enables) the on-chain payment method for a store using the supplied
 * derivation scheme. Returns BTCPay's payment-method payload so the caller can
 * confirm it reports the wallet as enabled before persisting Supabase state.
 */
export async function setOnChainWallet(
  config: BtcpayConfig,
  btcpayStoreId: string,
  derivationScheme: string,
  opts: { label?: string } = {},
): Promise<OnChainConfigResult> {
  const configBody: Record<string, unknown> = { derivationScheme };
  if (opts.label) configBody.label = opts.label;

  const parsed = await callOnChain(config, btcpayStoreId, 'PUT', '', {
    enabled: true,
    config: configBody,
  });

  const result = parsed as Partial<OnChainConfigResult> | null;
  if (!result || typeof result !== 'object') {
    throw new BtcpayApiError(
      'BTCPay returned an unexpected payment-method payload.',
      200,
      parsed,
    );
  }
  return result as OnChainConfigResult;
}
