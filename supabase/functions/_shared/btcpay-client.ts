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

  // NBXplorer scheme strings (not descriptors). BTCPay hints the script type
  // with a trailing -[label]; multisig is written as "N-of-xpub1-xpub2...".
  const hasP2sh = /-\[p2sh\]/i.test(lower);
  const hasLegacy = /-\[legacy\]/i.test(lower);
  const hasTaproot = /-\[taproot\]/i.test(lower);
  const isMultisig = /(^|-)\d+-of-/i.test(lower);

  if (isMultisig) {
    const addressType = hasP2sh
      ? 'Multi-sig P2SH-P2WSH'
      : hasLegacy
        ? 'Multi-sig P2SH'
        : 'Multi-sig P2WSH';
    return { provider: 'xpub', addressType };
  }
  if (hasTaproot) return { provider: 'xpub', addressType: 'P2TR (Taproot)' };
  if (hasP2sh) return { provider: 'xpub', addressType: 'P2SH-P2WPKH' };
  if (hasLegacy) return { provider: 'xpub', addressType: 'P2PKH (Legacy)' };

  // Bare extended keys: classify by SLIP-132 version prefix. Strip a key-origin
  // prefix first (e.g. [fingerprint/84h/0h/0h]xpub...). Uppercase initial letters
  // (Ypub/Zpub/Upub/Vpub) denote multisig variants; lowercase are single-sig.
  // Prefix casing is significant, so DON'T lowercase it.
  const stripped = v.replace(/^\[[^\]]*\]/, '');
  const prefix = stripped.slice(0, 4);
  const lowerPrefix = prefix.toLowerCase();
  let addressType = 'P2PKH (Legacy)';
  if (prefix === 'Zpub' || prefix === 'Vpub') addressType = 'Multi-sig P2WSH';
  else if (prefix === 'Ypub' || prefix === 'Upub') addressType = 'Multi-sig P2SH-P2WSH';
  else if (lowerPrefix === 'zpub' || lowerPrefix === 'vpub') addressType = 'P2WPKH (SegWit)';
  else if (lowerPrefix === 'ypub' || lowerPrefix === 'upub') addressType = 'P2SH-P2WPKH';
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
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  pathSuffix: string,
  body: Record<string, unknown> | null,
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
        // GET/DELETE carry no body; fetch rejects a body on GET.
        ...(body != null ? { body: JSON.stringify(body) } : {}),
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

    lastError = new BtcpayApiError(
      `BTCPay on-chain request failed (HTTP ${response.status}).`,
      response.status,
      parsed,
    );
    // Only fall back to the other id when this one is an unknown route (404).
    // A 400/422 means a valid handler rejected the content (e.g. bad scheme) —
    // surface it rather than masking it by retrying the other id.
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
  // POST /wallet/preview binds [FromBody] UpdatePaymentMethodRequest and requires
  // top-level `config`. We send config as a STRING (not { derivationScheme }):
  // BTCPay's string path runs the full parser (output descriptors, key-origin
  // [fp/path]xpub, xpub/ypub/zpub incl. Ypub/Zpub multisig, electrum, -[p2sh]),
  // whereas the object form skips descriptor parsing. This accepts ALL formats.
  const parsed = await callOnChain(
    config,
    btcpayStoreId,
    'POST',
    '/wallet/preview',
    { config: derivationScheme },
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
): Promise<OnChainConfigResult> {
  // Send config as a STRING (not { derivationScheme }) so BTCPay's full parser
  // runs — this is what makes output descriptors, key-origin [fp/path]xpub,
  // multisig (N-of-...), and every SLIP-132 variant work, not just plain xpub.
  const parsed = await callOnChain(config, btcpayStoreId, 'PUT', '', {
    enabled: true,
    config: derivationScheme,
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

export interface OnChainWalletState {
  /** True when a derivation scheme is configured for the store. */
  configured: boolean;
  /** Whether the on-chain payment method is currently enabled. */
  enabled: boolean;
  /** The merchant-facing wallet label at BTCPay, if any. */
  label: string | null;
  /** The stored derivation scheme (SERVER-ONLY — never return to the client). */
  derivationScheme: string | null;
  /** The account key path, if BTCPay tracks one (SERVER-ONLY). */
  accountKeyPath: string | null;
}

/**
 * Reads the store's on-chain payment method (enabled + label + scheme). Returns
 * a not-configured state if BTCPay has no wallet for the store (HTTP 404).
 * NOTE: the derivationScheme/accountKeyPath are for server-side round-tripping
 * only — callers must not return them to the mobile client.
 */
export async function getOnChainWallet(
  config: BtcpayConfig,
  btcpayStoreId: string,
): Promise<OnChainWalletState> {
  let parsed: unknown;
  try {
    parsed = await callOnChain(
      config,
      btcpayStoreId,
      'GET',
      '',
      null,
      '?includeConfig=true',
    );
  } catch (err) {
    // A 404 on both payment-method ids means no on-chain wallet is configured.
    if (err instanceof BtcpayApiError && err.status === 404) {
      return { configured: false, enabled: false, label: null, derivationScheme: null, accountKeyPath: null };
    }
    throw err;
  }

  const data = (parsed ?? {}) as {
    enabled?: unknown;
    config?: {
      accountDerivation?: unknown;
      derivationScheme?: unknown;
      label?: unknown;
      accountKeyPath?: unknown;
      accountKeySettings?: unknown;
    } | null;
  };
  const cfg = data.config ?? {};

  // IMPORTANT: the GET response serializes the scheme as `accountDerivation`,
  // while the PUT body expects `derivationScheme`. Read accountDerivation first
  // (fall back to derivationScheme just in case), so we correctly detect a
  // configured wallet and can re-send it on the settings PUT.
  const scheme =
    typeof cfg.accountDerivation === 'string' && cfg.accountDerivation
      ? cfg.accountDerivation
      : typeof cfg.derivationScheme === 'string' && cfg.derivationScheme
        ? cfg.derivationScheme
        : null;

  // Rebuild the "fingerprint/path" account key path if BTCPay reports it, so the
  // settings PUT keeps the same signing metadata.
  let accountKeyPath =
    typeof cfg.accountKeyPath === 'string' && cfg.accountKeyPath ? cfg.accountKeyPath : null;
  const aks = Array.isArray(cfg.accountKeySettings) ? cfg.accountKeySettings[0] : null;
  if (!accountKeyPath && aks && typeof aks === 'object') {
    const fp = (aks as { rootFingerprint?: unknown }).rootFingerprint;
    const kp = (aks as { accountKeyPath?: unknown }).accountKeyPath;
    if (typeof fp === 'string' && fp && typeof kp === 'string' && kp) {
      accountKeyPath = `${fp}/${kp}`;
    }
  }

  return {
    configured: scheme != null,
    enabled: data.enabled === true,
    label: typeof cfg.label === 'string' && cfg.label ? cfg.label : null,
    derivationScheme: scheme,
    accountKeyPath,
  };
}

/**
 * Updates the enabled flag and/or label WITHOUT changing the wallet. We re-send
 * the current derivation scheme (fetched server-side) so BTCPay keeps the same
 * wallet; the client never has to send — and we never have to log — the xpub.
 * Returns BTCPay's updated payment-method payload.
 */
export async function updateOnChainWalletSettings(
  config: BtcpayConfig,
  btcpayStoreId: string,
  current: OnChainWalletState,
  next: { enabled: boolean; label: string | null },
): Promise<OnChainConfigResult> {
  if (!current.configured || !current.derivationScheme) {
    throw new BtcpayApiError('No on-chain wallet is configured for this store.', 409, null);
  }

  // Echo BTCPay's own config back with the new label so the exact wallet is
  // preserved across every scheme type (descriptor, multisig, suffixed, etc.).
  const configBody: Record<string, unknown> = {
    derivationScheme: current.derivationScheme,
    label: next.label ?? '',
  };
  if (current.accountKeyPath) configBody.accountKeyPath = current.accountKeyPath;

  const parsed = await callOnChain(config, btcpayStoreId, 'PUT', '', {
    enabled: next.enabled,
    config: configBody,
  });

  const result = parsed as Partial<OnChainConfigResult> | null;
  if (!result || typeof result !== 'object') {
    throw new BtcpayApiError('BTCPay returned an unexpected payment-method payload.', 200, parsed);
  }
  return result as OnChainConfigResult;
}

/**
 * Removes the store's on-chain payment method at BTCPay. Idempotent: a 404
 * (already gone) is treated as success.
 */
export async function removeOnChainWallet(
  config: BtcpayConfig,
  btcpayStoreId: string,
): Promise<void> {
  try {
    await callOnChain(config, btcpayStoreId, 'DELETE', '', null);
  } catch (err) {
    if (err instanceof BtcpayApiError && err.status === 404) return; // already removed
    throw err;
  }
}

// ---------------------------------------------------------------------------
// On-chain wallet balance (read-only overview)
// ---------------------------------------------------------------------------
//
// Greenfield: GET /api/v1/stores/{storeId}/payment-methods/{pmId}/wallet
//   -> OnChainWalletOverviewData { balance, confirmedBalance, unconfirmedBalance }
// All three are DECIMAL BTC STRINGS (e.g. "0.00012500"). BTCPay computes them
// from NBXplorer's UTXO tracking of the store's derivation scheme, so it works
// for watch-only (xpub/descriptor) wallets — no hot wallet required.
//
// Field names + units verified against btcpayserver/btcpayserver master swagger
// (swagger.template.stores-wallet.on-chain.json, OnChainWalletOverviewData).

/**
 * Parses a decimal BTC string into integer satoshis WITHOUT floating point, so
 * no precision is lost. Returns a bigint. Throws on a malformed value.
 */
export function btcDecimalStringToSats(value: string): bigint {
  const v = (value ?? '').trim();
  const m = /^(-?)(\d*)(?:\.(\d*))?$/.exec(v);
  if (!m || (!m[2] && !m[3])) {
    throw new BtcpayApiError(`BTCPay returned a malformed BTC amount: "${value}".`, 200, null);
  }
  const sign = m[1] === '-' ? -1n : 1n;
  const whole = m[2] || '0';
  // BTC has exactly 8 decimal places (1 BTC = 100_000_000 sats). Pad/truncate to 8.
  const frac = (m[3] || '').padEnd(8, '0').slice(0, 8);
  return sign * (BigInt(whole) * 100_000_000n + BigInt(frac || '0'));
}

/** Renders integer satoshis back to a canonical 8-decimal BTC string. */
export function satsToBtcDecimalString(sats: bigint): string {
  const neg = sats < 0n;
  const abs = neg ? -sats : sats;
  const whole = abs / 100_000_000n;
  const frac = (abs % 100_000_000n).toString().padStart(8, '0');
  return `${neg ? '-' : ''}${whole}.${frac}`;
}

export interface OnChainWalletBalance {
  /** Confirmed spendable balance, in integer satoshis. */
  confirmedSats: bigint;
  /** Unconfirmed (mempool) balance, in integer satoshis. */
  unconfirmedSats: bigint;
  /** Total = confirmed + unconfirmed, in integer satoshis. */
  totalSats: bigint;
}

/**
 * Reads the store's on-chain wallet balance from BTCPay. Returns confirmed and
 * unconfirmed balances as exact integer satoshis (never a float). Throws
 * BtcpayApiError — a 404 means no on-chain wallet is configured for the store.
 */
export async function getOnChainWalletBalance(
  config: BtcpayConfig,
  btcpayStoreId: string,
): Promise<OnChainWalletBalance> {
  const parsed = await callOnChain(config, btcpayStoreId, 'GET', '/wallet', null);

  const data = (parsed ?? {}) as {
    balance?: unknown;
    confirmedBalance?: unknown;
    unconfirmedBalance?: unknown;
  };

  const readStr = (v: unknown): string | null =>
    typeof v === 'string' && v.trim() !== '' ? v.trim() : null;

  const confirmedRaw = readStr(data.confirmedBalance);
  const unconfirmedRaw = readStr(data.unconfirmedBalance);
  const totalRaw = readStr(data.balance);

  if (confirmedRaw == null && unconfirmedRaw == null && totalRaw == null) {
    throw new BtcpayApiError(
      'BTCPay returned an unexpected wallet overview payload (no balance).',
      200,
      parsed,
    );
  }

  // Prefer the explicit confirmed/unconfirmed split. Fall back gracefully when a
  // field is missing: if only the total is present, treat it as confirmed.
  const unconfirmedSats = unconfirmedRaw != null ? btcDecimalStringToSats(unconfirmedRaw) : 0n;
  let confirmedSats: bigint;
  if (confirmedRaw != null) {
    confirmedSats = btcDecimalStringToSats(confirmedRaw);
  } else if (totalRaw != null) {
    confirmedSats = btcDecimalStringToSats(totalRaw) - unconfirmedSats;
  } else {
    confirmedSats = 0n;
  }

  return {
    confirmedSats,
    unconfirmedSats,
    totalSats: confirmedSats + unconfirmedSats,
  };
}

// ---------------------------------------------------------------------------
// Store exchange rate (BTCPay-computed, from the store's configured price source)
// ---------------------------------------------------------------------------
//
// Greenfield: GET /api/v1/stores/{storeId}/rates?currencyPair=BTC_USD
//   -> [ { currencyPair, rate, errors } ]   (rate is a decimal string)
// This reuses the store's own rate source (Hachisu stores default to Kraken), so
// the fiat estimate matches what BTCPay would use to price an invoice. Verified
// against btcpayserver master swagger (swagger.template.stores-rates.json).

export interface StoreRate {
  /** e.g. "BTC_USD". */
  currencyPair: string;
  /** The rate as a decimal string, exactly as BTCPay reported it. */
  rate: string;
}

/**
 * Fetches the BTC -> fiat rate for a store from BTCPay's rates API. Throws
 * BtcpayApiError when the pair can't be priced (non-2xx, empty result, or the
 * result carries provider errors) so the caller can degrade fiat gracefully.
 */
export async function getStoreRate(
  config: BtcpayConfig,
  btcpayStoreId: string,
  currencyPair: string,
): Promise<StoreRate> {
  const { status, ok, parsed } = await btcpayGet(
    config,
    `/api/v1/stores/${encodeURIComponent(btcpayStoreId)}/rates` +
      `?currencyPair=${encodeURIComponent(currencyPair)}`,
  );

  if (!ok) {
    throw new BtcpayApiError(`BTCPay rate fetch failed (HTTP ${status}).`, status, parsed);
  }

  const rows = Array.isArray(parsed) ? (parsed as Array<Record<string, unknown>>) : [];
  const row =
    rows.find((r) => r?.currencyPair === currencyPair) ?? (rows.length > 0 ? rows[0] : null);
  const errors = row?.errors;
  const rate = row && typeof row.rate === 'string' ? row.rate.trim() : '';

  if (!row || !rate || (Array.isArray(errors) && errors.length > 0)) {
    throw new BtcpayApiError(
      `BTCPay could not price ${currencyPair}.`,
      status,
      // Keep the provider errors (not secrets) for server-side diagnosis.
      Array.isArray(errors) && errors.length > 0 ? { errors } : parsed,
    );
  }

  return { currencyPair, rate };
}

// ---------------------------------------------------------------------------
// Lightning via the Boltz plugin
// ---------------------------------------------------------------------------
//
// Hachisu does NOT expose BTCPay's "connect a Lightning node" choice to
// merchants. Every store uses the Boltz plugin (submarine swaps to Liquid).
// The Boltz plugin must be installed ONCE on the instance by the Hachisu admin —
// installation is an instance-admin operation, never automated from here.
//
// The plugin ships a stable Greenfield JSON API (verified against
// BoltzExchange/boltz-btcpay-plugin, GreenfieldBoltzController.cs). Routes are
// absolute (registered with `~/`), so they live under /api/v1/stores/... :
//
//   GET    /api/v1/stores/{storeId}/boltz/setup            -> BoltzSetupData
//   POST   /api/v1/stores/{storeId}/boltz/setup  { walletName }
//   DELETE /api/v1/stores/{storeId}/boltz/setup
//   GET    /api/v1/stores/{storeId}/boltz/wallets
//   POST   /api/v1/stores/{storeId}/boltz/wallets { name, currency, coreDescriptor }
//   DELETE /api/v1/stores/{storeId}/boltz/wallets/{walletId}
//
// There is NO Greenfield endpoint that lists installed plugins, so plugin
// detection is a probe: GET .../boltz/setup. A 404 means the route (plugin) is
// absent; we disambiguate "store gone" from "plugin gone" by first confirming
// the store exists via GET /api/v1/stores/{storeId}.
//
// Lightning payment method id in current BTCPay is "BTC-LN". When Boltz is set
// up (POST .../boltz/setup), the plugin itself wires the store's BTC-LN payment
// method to the Boltz daemon — we never PUT BTC-LN manually for the Boltz path.

export const LIGHTNING_PAYMENT_METHOD_ID = 'BTC-LN';

/** Minimal shape of GreenfieldBoltzController's BoltzSetupData. Kept loose. */
export interface BoltzSetupData {
  /** Whether Boltz Lightning is enabled for the store. */
  enabled?: boolean;
  /** The standalone Liquid (L-BTC) wallet backing the store, if configured. */
  wallet?: {
    id?: number;
    name?: string;
    currency?: string;
    readonly?: boolean;
    [key: string]: unknown;
  } | null;
  [key: string]: unknown;
}

/** Result of probing the Boltz plugin for a store. */
export type BoltzAvailability =
  | { available: true; setup: BoltzSetupData }
  | {
      available: false;
      /**
       * not_installed -> plugin route absent (404, store confirmed present).
       * forbidden     -> the Greenfield key lacks store-settings permission.
       * unsupported   -> route exists but returned an unexpected/error payload.
       */
      reason: 'not_installed' | 'forbidden' | 'unsupported';
      status: number;
      body: unknown;
    };

interface RawResponse {
  status: number;
  ok: boolean;
  parsed: unknown;
}

/** Internal: GET a BTCPay path with the server key; parse body (never throws on
 * a non-2xx — callers classify the status). Throws only on network failure. */
async function btcpayGet(config: BtcpayConfig, path: string): Promise<RawResponse> {
  let response: Response;
  try {
    response = await fetch(`${config.serverUrl}${path}`, {
      method: 'GET',
      headers: { Authorization: `token ${config.apiKey}` },
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
  return { status: response.status, ok: response.ok, parsed };
}

/**
 * Confirms a BTCPay store exists (GET /api/v1/stores/{storeId}). Returns the
 * store on 200, null on 404. Throws BtcpayApiError on other non-2xx responses.
 */
export async function getStore(
  config: BtcpayConfig,
  btcpayStoreId: string,
): Promise<BtcpayStore | null> {
  const { status, ok, parsed } = await btcpayGet(
    config,
    `/api/v1/stores/${encodeURIComponent(btcpayStoreId)}`,
  );
  if (ok) return parsed as BtcpayStore;
  if (status === 404) return null;
  throw new BtcpayApiError(
    `BTCPay store lookup failed (HTTP ${status}).`,
    status,
    parsed,
  );
}

/**
 * Probes whether the Boltz plugin is available for a store and returns its
 * current setup state. Detection only — does NOT modify the store.
 *
 * Call getStore() first to confirm the store exists, so a 404 here can be
 * attributed to the plugin route being absent rather than the store missing.
 */
export async function getStoreBoltzSetup(
  config: BtcpayConfig,
  btcpayStoreId: string,
): Promise<BoltzAvailability> {
  const { status, ok, parsed } = await btcpayGet(
    config,
    `/api/v1/stores/${encodeURIComponent(btcpayStoreId)}/boltz/setup`,
  );

  if (ok) {
    if (parsed && typeof parsed === 'object') {
      return { available: true, setup: parsed as BoltzSetupData };
    }
    return { available: false, reason: 'unsupported', status, body: parsed };
  }
  if (status === 404) {
    // Store is confirmed present by the caller -> the /boltz route is missing.
    return { available: false, reason: 'not_installed', status, body: parsed };
  }
  if (status === 401 || status === 403) {
    return { available: false, reason: 'forbidden', status, body: parsed };
  }
  return { available: false, reason: 'unsupported', status, body: parsed };
}

export interface LightningPaymentMethod {
  enabled?: boolean;
  [key: string]: unknown;
}

/**
 * Reads the store's Lightning (BTC-LN) payment method, or null if it isn't
 * configured yet (404). Throws BtcpayApiError on other non-2xx responses. Used
 * to confirm Boltz wired Lightning before marking a store connected.
 */
export async function getStoreLightningPaymentMethod(
  config: BtcpayConfig,
  btcpayStoreId: string,
): Promise<LightningPaymentMethod | null> {
  const { status, ok, parsed } = await btcpayGet(
    config,
    `/api/v1/stores/${encodeURIComponent(btcpayStoreId)}` +
      `/payment-methods/${LIGHTNING_PAYMENT_METHOD_ID}`,
  );
  if (ok) return (parsed as LightningPaymentMethod) ?? null;
  if (status === 404) return null;
  throw new BtcpayApiError(
    `BTCPay Lightning payment-method lookup failed (HTTP ${status}).`,
    status,
    parsed,
  );
}

/** A coarse, non-authoritative view of a store's Lightning readiness. */
export interface StoreLightningStatus {
  boltzAvailable: boolean;
  boltzEnabled: boolean;
  /** A readonly L-BTC wallet is attached to the Boltz setup. */
  hasLbtcWallet: boolean;
  /** BTCPay reports the BTC-LN payment method enabled. */
  lightningEnabled: boolean;
}

/**
 * Aggregates Boltz setup + BTC-LN payment-method state into one status object.
 * Best-effort: missing pieces resolve to false rather than throwing, except for
 * network failures which propagate.
 */
export async function getStoreLightningStatus(
  config: BtcpayConfig,
  btcpayStoreId: string,
): Promise<StoreLightningStatus> {
  const boltz = await getStoreBoltzSetup(config, btcpayStoreId);
  if (!boltz.available) {
    return {
      boltzAvailable: false,
      boltzEnabled: false,
      hasLbtcWallet: false,
      lightningEnabled: false,
    };
  }

  const wallet = boltz.setup.wallet;
  let lightningEnabled = false;
  try {
    const ln = await getStoreLightningPaymentMethod(config, btcpayStoreId);
    lightningEnabled = ln?.enabled === true;
  } catch {
    // Treat a payment-method read failure as "not enabled" for status purposes.
  }

  return {
    boltzAvailable: true,
    boltzEnabled: boltz.setup.enabled === true,
    hasLbtcWallet: !!wallet && typeof wallet === 'object',
    lightningEnabled,
  };
}

// ---------------------------------------------------------------------------
// Boltz L-BTC wallet import + setup (Phase 3)
// ---------------------------------------------------------------------------
//
// Connecting Lightning for a store is a two-call sequence on the Boltz plugin:
//   1. POST /api/v1/stores/{storeId}/boltz/wallets
//        { name, currency: "LBTC", coreDescriptor }  -> watch-only import
//   2. POST /api/v1/stores/{storeId}/boltz/setup  { walletName: name }
//        -> makes that wallet the store's Lightning receive wallet; the plugin
//           itself wires the store's BTC-LN payment method to the Boltz daemon.
//
// We only ever import a READ-ONLY core descriptor (coreDescriptor). We never
// send a mnemonic/seed and never create a hot wallet.

/**
 * Masks a wallet descriptor for safe logging. A descriptor reveals a wallet's
 * entire address history, so the full value is NEVER logged. e.g. "elwpkh…f0aa".
 */
export function maskDescriptor(value: string): string {
  const v = (value ?? '').trim();
  if (v.length <= 12) return '***';
  return `${v.slice(0, 6)}…${v.slice(-4)}`;
}

/** A Boltz wallet as returned by the plugin (loose — we only read a few fields). */
export interface BoltzWallet {
  id?: number;
  name?: string;
  currency?: string;
  readonly?: boolean;
  [key: string]: unknown;
}

/**
 * Internal: POST a JSON body to a BTCPay path with the server key. Parses the
 * body; throws BtcpayApiError on network failure or a non-2xx response (the
 * parsed body is captured for diagnostics — callers must not log it verbatim as
 * it can echo the submitted descriptor).
 */
async function btcpayPost(
  config: BtcpayConfig,
  path: string,
  body: Record<string, unknown>,
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(`${config.serverUrl}${path}`, {
      method: 'POST',
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

  if (!response.ok) {
    throw new BtcpayApiError(
      `BTCPay Boltz request failed (HTTP ${response.status}).`,
      response.status,
      parsed,
    );
  }
  return parsed;
}

/** Lists the Boltz wallets configured for a store (empty array on 404). */
export async function listBoltzWallets(
  config: BtcpayConfig,
  btcpayStoreId: string,
): Promise<BoltzWallet[]> {
  const { status, ok, parsed } = await btcpayGet(
    config,
    `/api/v1/stores/${encodeURIComponent(btcpayStoreId)}/boltz/wallets`,
  );
  if (status === 404) return [];
  if (!ok) {
    throw new BtcpayApiError(
      `BTCPay Boltz wallet list failed (HTTP ${status}).`,
      status,
      parsed,
    );
  }
  return Array.isArray(parsed) ? (parsed as BoltzWallet[]) : [];
}

/**
 * Imports a READ-ONLY L-BTC wallet from a core descriptor. Returns the created
 * Boltz wallet. Throws BtcpayApiError on failure (body captured but NEVER log it
 * verbatim — it can echo the descriptor).
 */
export async function importBoltzLbtcWallet(
  config: BtcpayConfig,
  btcpayStoreId: string,
  input: { name: string; coreDescriptor: string },
): Promise<BoltzWallet> {
  const parsed = await btcpayPost(
    config,
    `/api/v1/stores/${encodeURIComponent(btcpayStoreId)}/boltz/wallets`,
    { name: input.name, currency: 'LBTC', coreDescriptor: input.coreDescriptor },
  );
  const wallet = parsed as Partial<BoltzWallet> | null;
  if (!wallet || typeof wallet !== 'object') {
    throw new BtcpayApiError(
      'BTCPay returned an unexpected Boltz wallet payload.',
      200,
      null, // do not retain the body: it may echo the descriptor.
    );
  }
  return wallet as BoltzWallet;
}

/**
 * Selects the named Boltz wallet as the store's Lightning receive wallet. The
 * plugin wires the store's BTC-LN payment method to the Boltz daemon. Returns
 * the resulting BoltzSetupData so the caller can confirm it reports enabled.
 */
export async function setupBoltzForStore(
  config: BtcpayConfig,
  btcpayStoreId: string,
  walletName: string,
): Promise<BoltzSetupData> {
  const parsed = await btcpayPost(
    config,
    `/api/v1/stores/${encodeURIComponent(btcpayStoreId)}/boltz/setup`,
    { walletName },
  );
  const setup = parsed as Partial<BoltzSetupData> | null;
  if (!setup || typeof setup !== 'object') {
    throw new BtcpayApiError(
      'BTCPay returned an unexpected Boltz setup payload.',
      200,
      parsed,
    );
  }
  return setup as BoltzSetupData;
}

/** Extracts the Boltz plugin's structured error code (e.g. "boltz-unavailable")
 * from a parsed BTCPay error body, if present. */
export function extractBoltzCode(body: unknown): string | null {
  if (body && typeof body === 'object' && typeof (body as { code?: unknown }).code === 'string') {
    return (body as { code: string }).code;
  }
  if (typeof body === 'string') {
    try {
      const p = JSON.parse(body);
      if (p && typeof p.code === 'string') return p.code;
    } catch {
      // Not JSON — no code.
    }
  }
  return null;
}

/** Internal: POST JSON to a BTCPay path, returning the raw status/body WITHOUT
 * throwing on a non-2xx (only a network failure throws). Mirror of btcpayGet. */
async function btcpayPostRaw(
  config: BtcpayConfig,
  path: string,
  body: Record<string, unknown>,
): Promise<RawResponse> {
  let response: Response;
  try {
    response = await fetch(`${config.serverUrl}${path}`, {
      method: 'POST',
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
  return { status: response.status, ok: response.ok, parsed };
}

/**
 * Sentinel wallet name used ONLY to trigger per-store Boltz auto-provisioning
 * while probing readiness. It is intentionally a name that will not exist, so the
 * setup call returns a harmless "wallet not found" error (proving the daemon
 * reached provisioning) rather than actually enabling any wallet.
 */
export const READINESS_SENTINEL_WALLET = '__hachisu_readiness_probe__';

/** Result of ensuring a store is Boltz-ready to accept a descriptor import. */
export type BoltzReadiness =
  | { ready: true }
  | {
      ready: false;
      /**
       * daemon_unavailable -> the Boltz daemon isn't reachable / the store can't
       *   be provisioned (e.g. daemon down, or non-admin key + tenants disabled).
       * unknown -> an unexpected error (permission/route/config) — treat as blocked.
       */
      reason: 'daemon_unavailable' | 'unknown';
      status: number;
      code: string | null;
    };

/**
 * Ensures a store can accept a Boltz L-BTC wallet import RIGHT NOW, and provisions
 * it if needed. This is the correct readiness gate:
 *
 *   1. GET /boltz/wallets — 200 means the store is already provisioned (fast path,
 *      read-only). NOTE: this endpoint returns `boltz-unavailable` for a store that
 *      simply hasn't been provisioned yet, so a 400 here is NOT conclusive.
 *   2. On `boltz-unavailable`, POST /boltz/setup with a non-existent sentinel wallet
 *      to trigger the plugin's on-demand per-store provisioning (GetOrCreateClient):
 *        - still `boltz-unavailable`  -> daemon truly unavailable / can't provision.
 *        - any other error (e.g. `boltz-error` "wallet not found") or 2xx
 *          -> the daemon is reachable and the store is now provisioned -> READY.
 *
 * Only a network failure throws; all HTTP outcomes resolve to a BoltzReadiness.
 */
export async function ensureBoltzStoreReady(
  config: BtcpayConfig,
  btcpayStoreId: string,
): Promise<BoltzReadiness> {
  const base = `/api/v1/stores/${encodeURIComponent(btcpayStoreId)}/boltz`;

  const list = await btcpayGet(config, `${base}/wallets`);
  if (list.ok) return { ready: true };

  const listCode = extractBoltzCode(list.parsed);
  if (!(list.status === 400 && listCode === 'boltz-unavailable')) {
    // Unexpected: 403 (permission), 404 (plugin route gone), etc. Blocked.
    return { ready: false, reason: 'unknown', status: list.status, code: listCode };
  }

  // Not provisioned yet — try to provision on demand.
  const probe = await btcpayPostRaw(config, `${base}/setup`, {
    walletName: READINESS_SENTINEL_WALLET,
  });
  if (probe.ok) return { ready: true };

  const probeCode = extractBoltzCode(probe.parsed);
  if (probeCode === 'boltz-unavailable') {
    return { ready: false, reason: 'daemon_unavailable', status: probe.status, code: probeCode };
  }
  // Daemon reachable and store provisioned (the sentinel wallet just doesn't exist).
  return { ready: true };
}

// ---------------------------------------------------------------------------
// Lightning settings (mobile Lightning Settings screen)
// ---------------------------------------------------------------------------
//
// The "Enabled" flag lives on the BTC-LN payment method; its config holds the
// connectionString (the Boltz macaroon) which is SERVER-ONLY and must be
// round-tripped, never returned to the client. The "description template" is a
// STORE-level field (lightningDescriptionTemplate), updated via PUT /stores/{id}.

/** Internal: PUT JSON, returning the parsed body; throws on network / non-2xx. */
async function btcpayPut(
  config: BtcpayConfig,
  path: string,
  body: Record<string, unknown>,
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(`${config.serverUrl}${path}`, {
      method: 'PUT',
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
  if (!response.ok) {
    throw new BtcpayApiError(
      `BTCPay request failed (HTTP ${response.status}).`,
      response.status,
      parsed,
    );
  }
  return parsed;
}

/** Internal: DELETE a path; returns the status. Throws on network / non-2xx
 * (except 404, which is returned so callers can treat it as idempotent). */
async function btcpayDelete(config: BtcpayConfig, path: string): Promise<number> {
  let response: Response;
  try {
    response = await fetch(`${config.serverUrl}${path}`, {
      method: 'DELETE',
      headers: { Authorization: `token ${config.apiKey}` },
    });
  } catch (cause) {
    throw new BtcpayApiError(
      `Could not reach BTCPay Server at ${config.serverUrl}.`,
      0,
      { cause: String(cause) },
    );
  }
  if (response.ok || response.status === 404) return response.status;
  const rawText = await response.text();
  let parsed: unknown = rawText;
  try {
    parsed = rawText ? JSON.parse(rawText) : null;
  } catch {
    // Leave parsed as raw text.
  }
  throw new BtcpayApiError(
    `BTCPay delete failed (HTTP ${response.status}).`,
    response.status,
    parsed,
  );
}

export interface LightningPaymentMethodState {
  /** True when a Lightning connection (connectionString/internalNodeRef) is set. */
  configured: boolean;
  /** Whether the BTC-LN payment method is currently enabled. */
  enabled: boolean;
  /** Raw BTCPay config — SERVER-ONLY (holds the Boltz macaroon). Never return to
   * the client; only round-trip it on a PUT that preserves the connection. */
  config: Record<string, unknown> | null;
}

/**
 * Reads the store's BTC-LN payment method WITH config (server-side only). Returns
 * a not-configured state on 404. The `config` must never be returned to a client.
 */
export async function getLightningPaymentMethodConfig(
  config: BtcpayConfig,
  btcpayStoreId: string,
): Promise<LightningPaymentMethodState> {
  const { status, ok, parsed } = await btcpayGet(
    config,
    `/api/v1/stores/${encodeURIComponent(btcpayStoreId)}` +
      `/payment-methods/${LIGHTNING_PAYMENT_METHOD_ID}?includeConfig=true`,
  );
  if (status === 404) return { configured: false, enabled: false, config: null };
  if (!ok) {
    throw new BtcpayApiError(
      `BTCPay Lightning payment-method lookup failed (HTTP ${status}).`,
      status,
      parsed,
    );
  }
  const pm = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  const cfg =
    pm.config && typeof pm.config === 'object' ? (pm.config as Record<string, unknown>) : null;
  const hasConnection =
    !!cfg &&
    ((typeof cfg.connectionString === 'string' && cfg.connectionString.length > 0) ||
      (typeof cfg.internalNodeRef === 'string' && cfg.internalNodeRef.length > 0));
  return { configured: hasConnection, enabled: pm.enabled === true, config: cfg };
}

/**
 * Sets the BTC-LN enabled flag WITHOUT changing the connection — the current
 * config (fetched server-side) is echoed back so the Boltz connection is
 * preserved. Returns BTCPay's reported enabled state.
 */
export async function setLightningEnabled(
  config: BtcpayConfig,
  btcpayStoreId: string,
  enabled: boolean,
  currentConfig: Record<string, unknown> | null,
): Promise<{ enabled: boolean }> {
  const parsed = await btcpayPut(
    config,
    `/api/v1/stores/${encodeURIComponent(btcpayStoreId)}/payment-methods/${LIGHTNING_PAYMENT_METHOD_ID}`,
    { enabled, config: currentConfig ?? {} },
  );
  const pm = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  return { enabled: pm.enabled === true };
}

/** Reads the store's Lightning invoice description template (non-sensitive). */
export function getStoreLightningDescriptionTemplate(store: BtcpayStore): string | null {
  const v = (store as Record<string, unknown>).lightningDescriptionTemplate;
  return typeof v === 'string' ? v : null;
}

/**
 * Updates the store's Lightning invoice description template. BTCPay's store PUT
 * is a full update, so we echo the current store object (already fetched) back
 * with only lightningDescriptionTemplate changed — preserving all other settings.
 */
export async function setStoreLightningDescriptionTemplate(
  config: BtcpayConfig,
  btcpayStoreId: string,
  currentStore: BtcpayStore,
  template: string | null,
): Promise<void> {
  const body: Record<string, unknown> = {
    ...(currentStore as Record<string, unknown>),
    lightningDescriptionTemplate: template ?? '',
  };
  delete body.id; // id is the path param, not part of the update body.
  await btcpayPut(config, `/api/v1/stores/${encodeURIComponent(btcpayStoreId)}`, body);
}

/**
 * Removes the store's BTC-LN payment method at BTCPay. Idempotent: a 404 (already
 * gone) is treated as success. Note: this removes the store's Lightning payment
 * method only; it does not delete the underlying Boltz wallet.
 */
export async function removeLightningPaymentMethod(
  config: BtcpayConfig,
  btcpayStoreId: string,
): Promise<void> {
  await btcpayDelete(
    config,
    `/api/v1/stores/${encodeURIComponent(btcpayStoreId)}/payment-methods/${LIGHTNING_PAYMENT_METHOD_ID}`,
  );
}

// ---------------------------------------------------------------------------
// Pay Button (mobile Pay Button screen)
// ---------------------------------------------------------------------------
//
// BTCPay's store-level "Pay Button" is enabled by the store setting
// "Allow anyone to create invoices" — Greenfield `anyoneCanCreateInvoice` (bool)
// on StoreBaseData. This is the exact toggle behind the green "Enable" button on
// BTCPay's Pay Button page. We read it with GET /api/v1/stores/{id} and flip it
// with a full-store PUT (BTCPay's store update is a full replace, so we echo the
// current store object back with only this field changed — the same approach as
// setStoreLightningDescriptionTemplate). BTCPay stays the source of truth: the
// caller re-reads the store after the PUT to confirm the authoritative value.

/** Reads the store's Pay Button state (anyoneCanCreateInvoice) from a store object. */
export function readStorePayButtonEnabled(store: BtcpayStore): boolean {
  return (store as Record<string, unknown>).anyoneCanCreateInvoice === true;
}

/**
 * Reads the store and returns whether the Pay Button (anyoneCanCreateInvoice) is
 * enabled, along with the full store object (so callers can echo it on a PUT).
 * Throws BtcpayApiError if the store is missing (404) or on other failures.
 */
export async function getStorePayButton(
  config: BtcpayConfig,
  btcpayStoreId: string,
): Promise<{ enabled: boolean; store: BtcpayStore }> {
  const store = await getStore(config, btcpayStoreId);
  if (!store) {
    throw new BtcpayApiError(
      `BTCPay store ${btcpayStoreId} was not found.`,
      404,
      null,
    );
  }
  return { enabled: readStorePayButtonEnabled(store), store };
}

/**
 * Enables/disables the Pay Button by setting anyoneCanCreateInvoice on the store.
 * BTCPay's store PUT is a full update, so we echo the current store object back
 * with only anyoneCanCreateInvoice changed — preserving all other settings.
 * Returns BTCPay's updated store object.
 */
export async function setStorePayButtonEnabled(
  config: BtcpayConfig,
  btcpayStoreId: string,
  currentStore: BtcpayStore,
  enabled: boolean,
): Promise<BtcpayStore> {
  const body: Record<string, unknown> = {
    ...(currentStore as Record<string, unknown>),
    anyoneCanCreateInvoice: enabled,
  };
  delete body.id; // id is the path param, not part of the update body.
  const parsed = await btcpayPut(
    config,
    `/api/v1/stores/${encodeURIComponent(btcpayStoreId)}`,
    body,
  );
  const store = parsed as Partial<BtcpayStore> | null;
  if (!store || typeof store !== 'object') {
    throw new BtcpayApiError('BTCPay returned an unexpected store payload.', 200, parsed);
  }
  return store as BtcpayStore;
}

// ---------------------------------------------------------------------------
// Pay Button output generation (HTML snippet / Link / LNURL)
// ---------------------------------------------------------------------------
//
// IMPORTANT: BTCPay exposes NO Greenfield (or any HTTP) endpoint that returns the
// Pay Button's generated HTML/link. In BTCPay the output is built entirely in the
// browser by wwwroot/paybutton/paybutton.js (the `inputChanges` function) inside
// the store's Pay Button admin page — there is nothing server-side to fetch.
// So we DERIVE the output here, server-side, from BTCPay-confirmed source-of-truth
// data (real base URL from env, store id resolved from the owned row, and only
// after confirming anyoneCanCreateInvoice). The format below mirrors paybutton.js
// field-for-field so a merchant pasting it gets BTCPay's real behavior:
//
//   Form:  POST {root}/api/v1/invoices  with hidden inputs storeId,
//          [checkoutDesc], and (fixed) price + currency. Submit is the pay image.
//          orderId is intentionally NOT embedded here (reusable public code must
//          not carry a single static order id).
//   Link:  GET  {root}/api/v1/invoices?storeId=..&currency=..[&price=..][&orderId=..]
//          — the PayButtonHandle endpoint accepts GET, creates the invoice and
//          redirects to checkout (jsonResponse is intentionally omitted, as in
//          paybutton.js). This is the one-time shareable link + QR payload; the
//          orderId rides here (single use), not in the embeddable form.
//   LNURL: paybutton.js builds it from the store LNURL-pay endpoint
//          (Url.Action("GetLNUrlForStore","UILNURL",…,"lnurlp") ->
//          lnurlp://{host}/{cryptoCode}/lnurl/{storeId}/pay?currency=&amount=&orderId=).
//          We only return it when Lightning (BTC-LN) is actually enabled for the
//          store; otherwise lnurl is null.
//
// Only the invoice-affecting fields that BTCPay's PayButtonViewModel supports are
// emitted (storeId, price, currency, orderId, checkoutDesc). No invented fields.

/** Default on-chain crypto code BTCPay uses when building the store LNURL route. */
const PAY_BUTTON_DEFAULT_CRYPTO = 'BTC';

/** HTML-escapes a value exactly like paybutton.js `esc()` (& ' " < >). */
function escapePayButtonHtml(input: unknown): string {
  return ('' + input)
    .replace(/&/g, '&amp;')
    .replace(/'/g, '&apos;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Builds the currency <select>, mirroring paybutton.js `addSelectCurrency`. */
function buildCurrencySelect(currency: string): string {
  const safe = currency.replace(/[^a-z]/gi, '').toUpperCase();
  const defaults = ['USD', 'GBP', 'EUR', 'BTC'];
  const options = defaults.map(
    (c) => `      <option value="${c}"${c === safe ? ' selected' : ''}>${c}</option>`,
  );
  if (!defaults.includes(safe)) {
    options.unshift(`      <option value="${safe}" selected>${safe}</option>`);
  }
  return `    <select name="currency">\n${options.join('\n')}\n    </select>\n`;
}

// Slider defaults. BTCPay's Pay Button admin page seeds a slider with
// Min=1, Max=20, Step="1" (UIPayButtonController.PayButton). We use those same
// defaults rather than inventing merchant-facing min/max/step fields — the payer
// picks a value in that range with the slider.
const SLIDER_MIN = 1;
const SLIDER_MAX = 20;
const SLIDER_STEP = 1;

// The exact progressive-enhancement scripts BTCPay appends for a slider button
// (Views/PayButton.cshtml templates `price-slider` + `price-input`). They keep the
// range slider and the number field in sync and clamp to min/max. Copied verbatim
// so a pasted slider snippet behaves identically to BTCPay's own output.
const SLIDER_SCRIPT =
  `<script>\n` +
  `    function handleSliderChange(event) {\n` +
  `        event.preventDefault();\n` +
  `        const root = event.target.closest('.btcpay-form');\n` +
  `        const el = root.querySelector('.btcpay-input-price');\n` +
  `        const price = parseInt(el.value);\n` +
  `        const min = parseInt(event.target.getAttribute('min')) || 1;\n` +
  `        const max = parseInt(event.target.getAttribute('max'));\n` +
  `        if (price < min) { el.value = min; } else if (price > max) { el.value = max; }\n` +
  `        root.querySelector('.btcpay-input-range').value = el.value;\n` +
  `    }\n` +
  `    function handleSliderInput(event) {\n` +
  `        event.target.closest('.btcpay-form').querySelector('.btcpay-input-price').value = event.target.value;\n` +
  `    }\n` +
  `    function handlePriceInput(event) {\n` +
  `        event.preventDefault();\n` +
  `        const root = event.target.closest('.btcpay-form');\n` +
  `        const price = parseInt(event.target.dataset.price);\n` +
  `        if (isNaN(event.target.value)) root.querySelector('.btcpay-input-price').value = price;\n` +
  `        const min = parseInt(event.target.getAttribute('min')) || 1;\n` +
  `        const max = parseInt(event.target.getAttribute('max'));\n` +
  `        if (event.target.value < min) { event.target.value = min; } else if (event.target.value > max) { event.target.value = max; }\n` +
  `    }\n` +
  `    document.querySelectorAll(".btcpay-form .btcpay-input-range").forEach(function(el) {\n` +
  `        if (!el.dataset.initialized) { el.addEventListener('input', handleSliderInput); el.dataset.initialized = true; }\n` +
  `    });\n` +
  `    document.querySelectorAll(".btcpay-form .btcpay-input-price").forEach(function(el) {\n` +
  `        if (!el.dataset.initialized) { el.addEventListener('input', handlePriceInput); el.addEventListener('change', handleSliderChange); el.dataset.initialized = true; }\n` +
  `    });\n` +
  `</script>`;

// The exact scripts BTCPay appends for a custom-amount button (Views/PayButton.cshtml
// templates `price-buttons` + `price-input`): the +/- steppers and the number-field
// clamp. Copied verbatim so a pasted custom snippet behaves like BTCPay's output.
const CUSTOM_SCRIPT =
  `<script>\n` +
  `    function handlePlusMinus(event) {\n` +
  `        event.preventDefault();\n` +
  `        const root = event.target.closest('.btcpay-form');\n` +
  `        const el = root.querySelector('.btcpay-input-price');\n` +
  `        const step = parseInt(event.target.dataset.step) || 1;\n` +
  `        const min = parseInt(event.target.dataset.min) || 1;\n` +
  `        const max = parseInt(event.target.dataset.max);\n` +
  `        const type = event.target.dataset.type;\n` +
  `        const price = parseInt(el.value) || min;\n` +
  `        if (type === '-') { el.value = price - step < min ? min : price - step; }\n` +
  `        else if (type === '+') { el.value = price + step > max ? max : price + step; }\n` +
  `    }\n` +
  `    function handlePriceInput(event) {\n` +
  `        event.preventDefault();\n` +
  `        const root = event.target.closest('.btcpay-form');\n` +
  `        const price = parseInt(event.target.dataset.price);\n` +
  `        if (isNaN(event.target.value)) root.querySelector('.btcpay-input-price').value = price;\n` +
  `        const min = parseInt(event.target.getAttribute('min')) || 1;\n` +
  `        const max = parseInt(event.target.getAttribute('max'));\n` +
  `        if (event.target.value < min) { event.target.value = min; } else if (event.target.value > max) { event.target.value = max; }\n` +
  `    }\n` +
  `    document.querySelectorAll(".btcpay-form .plus-minus").forEach(function(el) {\n` +
  `        if (!el.dataset.initialized) { el.addEventListener('click', handlePlusMinus); el.dataset.initialized = true; }\n` +
  `    });\n` +
  `    document.querySelectorAll(".btcpay-form .btcpay-input-price").forEach(function(el) {\n` +
  `        if (!el.dataset.initialized) { el.addEventListener('input', handlePriceInput); el.dataset.initialized = true; }\n` +
  `    });\n` +
  `</script>`;

/** Formats a validated numeric value for an HTML attribute (trims float noise). */
function fmtNum(n: number): string {
  return String(Number(n.toFixed(8)));
}

export interface PayButtonOutputParams {
  btcpayStoreId: string;
  /** Uppercased currency code (e.g. "USD"). */
  currency: string;
  /** Positive numeric string for a FIXED amount; null for custom/slider. */
  price: string | null;
  /** Range config for custom/slider (validated numbers); null for fixed. */
  min: number | null;
  max: number | null;
  step: number | null;
  checkoutDesc: string | null;
  orderId: string | null;
  /**
   * 'fixed'  -> hidden price + currency.
   * 'custom' -> payer-editable price field with +/- steppers, bounded by min/max/step.
   * 'slider' -> payer-editable price field + range slider, bounded by min/max/step.
   * Custom and slider use the merchant's configured min/max/step (no default fallback).
   */
  buttonType: 'fixed' | 'custom' | 'slider';
  /** When true, an LNURL is derived from the store's LNURL-pay endpoint. */
  lightningAvailable: boolean;
}

export interface PayButtonOutput {
  htmlCode: string;
  linkUrl: string;
  lnurl: string | null;
  /**
   * Honest notes about what the returned output cannot reproduce (e.g. the public
   * GET link can't carry custom/slider range interactivity). Shown to the merchant;
   * never used to fake behavior.
   */
  limitations: string[];
}

/**
 * Derives BTCPay's Pay Button HTML snippet + shareable Link (+ optional LNURL)
 * server-side, matching paybutton.js. `config.serverUrl` must be the real BTCPay
 * base URL and `params.btcpayStoreId` the server-resolved store id. For custom and
 * slider, `min`/`max`/`step` are the merchant's validated values — NOT defaults.
 */
export function buildPayButtonOutput(
  config: BtcpayConfig,
  params: PayButtonOutputParams,
): PayButtonOutput {
  const root = config.serverUrl; // already trailing-slash-stripped by getBtcpayConfig
  const actionUrl = `${root}/api/v1/invoices`;
  const payImageUrl = `${root}/img/paybutton/pay.svg`;
  const { btcpayStoreId, currency, price, min, max, step, checkoutDesc, orderId, buttonType } =
    params;
  const limitations: string[] = [];

  const hidden = (name: string, value: string) =>
    `  <input type="hidden" name="${escapePayButtonHtml(name)}" value="${escapePayButtonHtml(value)}" />\n`;

  // Form (matches paybutton.js field order: storeId, checkoutDesc, then
  // amount/currency, then the pay image submit).
  //
  // NOTE: we intentionally do NOT emit orderId in the embeddable <form>. This HTML
  // is meant to be pasted onto a public website and reused by many customers, so a
  // single static orderId would tag every payment with the same id (confusing
  // reporting / duplicate-looking orders). BTCPay's own default Pay Button also
  // omits orderId unless the merchant explicitly sets one. The orderId is instead
  // carried only on the one-time shareable Link below. (Activity source detection
  // does NOT rely on the orderId — see get-btcpay-store-activity deriveSourceFeature.)
  let html =
    `<form method="POST" action="${escapePayButtonHtml(actionUrl)}" class="btcpay-form btcpay-form--block">\n` +
    hidden('storeId', btcpayStoreId);
  if (checkoutDesc) html += hidden('checkoutDesc', checkoutDesc);

  let appendScript = '';
  if (buttonType === 'fixed') {
    // Fixed amount: price + currency travel as hidden inputs.
    if (price) html += hidden('price', price);
    html += hidden('currency', currency);
  } else if (buttonType === 'custom') {
    // Custom amount: +/- steppers around a payer-editable price field, bounded by
    // the merchant's min/max/step. Mirrors paybutton.js buttonType==1. `max` is a
    // real numeric value here (validated max>min) — never max="none".
    const mn = fmtNum(min ?? 1);
    const mx = fmtNum(max ?? 20);
    const st = fmtNum(step ?? 1);
    const plusMinus = (type: '-' | '+') =>
      `      <button class="plus-minus" type="button" data-type="${type}" data-step="${st}" data-min="${mn}" data-max="${mx}">${type}</button>\n`;
    html +=
      '  <div class="btcpay-custom-container">\n    <div class="btcpay-custom">\n' +
      plusMinus('-') +
      `      <input class="btcpay-input-price" type="number" name="price" min="${mn}" max="${mx}" step="${st}" value="${mn}" data-price="${mn}" style="width:3em;" />\n` +
      plusMinus('+') +
      '    </div>\n' +
      buildCurrencySelect(currency) +
      '  </div>\n';
    appendScript = `\n${CUSTOM_SCRIPT}`;
  } else {
    // Slider: payer-editable price field + a range slider, bounded by the
    // merchant's min/max/step. Mirrors paybutton.js buttonType==2, including the
    // sync/clamp script. `max` is a real numeric value — never max="none".
    const mn = fmtNum(min ?? SLIDER_MIN);
    const mx = fmtNum(max ?? SLIDER_MAX);
    const st = fmtNum(step ?? SLIDER_STEP);
    html +=
      '  <div class="btcpay-custom-container">\n' +
      `      <input class="btcpay-input-price" type="number" name="price" min="${mn}" max="${mx}" step="${st}" value="${mn}" data-price="${mn}" style="width:209px;" />\n` +
      buildCurrencySelect(currency) +
      `    <input type="range" class="btcpay-input-range" min="${mn}" max="${mx}" step="${st}" value="${mn}" style="width:209px;margin-bottom:15px;" />\n` +
      '  </div>\n';
    appendScript = `\n${SLIDER_SCRIPT}`;
  }

  html +=
    `  <input type="image" class="submit" name="submit" src="${escapePayButtonHtml(payImageUrl)}" style="width:209px" alt="Pay with Hachisu">\n` +
    '</form>' +
    appendScript;

  // Shareable Link (GET). PayButtonHandle accepts GET, so opening this creates the
  // invoice and redirects to checkout. jsonResponse is omitted (as in paybutton.js).
  //
  // IMPORTANT: BTCPay's public invoice endpoint (UIPublicPayButtonController) reads
  // ONLY a single `price` (+ currency/orderId/checkoutDesc) — it does NOT accept
  // min/max/step (those are purely the HTML widget's client-side config). So a link
  // cannot reproduce custom/slider interactivity. For fixed we carry the price; for
  // custom/slider we emit an amount-selectable (price-less) link and record an honest
  // limitation rather than pretend the range is enforced.
  const linkParams = new URLSearchParams();
  linkParams.set('storeId', btcpayStoreId);
  linkParams.set('currency', currency);
  if (buttonType === 'fixed' && price) {
    linkParams.set('price', price);
  } else if (buttonType === 'custom' || buttonType === 'slider') {
    limitations.push(
      `BTCPay's public payment link can't carry ${
        buttonType === 'slider' ? 'slider' : 'custom amount'
      } min/max/step, so the Link and QR open an amount-selectable checkout where the ` +
        `customer enters any amount. The generated HTML code includes the full ${
          buttonType === 'slider' ? 'slider' : 'custom amount'
        } behavior.`,
    );
  }
  if (orderId) linkParams.set('orderId', orderId);
  if (checkoutDesc) linkParams.set('checkoutDesc', checkoutDesc);
  const linkUrl = `${actionUrl}?${linkParams.toString()}`;

  // LNURL — only when Lightning is actually enabled for the store. Derived from
  // the store LNURL-pay endpoint exactly as paybutton.js does (lnurlp scheme).
  let lnurl: string | null = null;
  if (params.lightningAvailable) {
    const host = root.replace(/^https?:\/\//i, '');
    let lnurlResult =
      `lnurlp://${host}/${PAY_BUTTON_DEFAULT_CRYPTO}/lnurl/${encodeURIComponent(btcpayStoreId)}/pay?`;
    if (currency) lnurlResult += `&currency=${encodeURIComponent(currency)}`;
    if (buttonType === 'fixed' && price) lnurlResult += `&amount=${encodeURIComponent(price)}`;
    if (orderId) lnurlResult += `&orderId=${encodeURIComponent(orderId)}`;
    lnurl = lnurlResult.replace('?&', '?');
  }

  return { htmlCode: html, linkUrl, lnurl, limitations };
}

// ---------------------------------------------------------------------------
// Invoice / payment activity (reporting source of truth for the Activity feed)
// ---------------------------------------------------------------------------
//
// Greenfield:
//   GET /api/v1/stores/{storeId}/invoices
//        ?startDate&endDate (unix seconds) &skip&take[&status][&orderId]
//        -> InvoiceData[]  (newest first)
//   GET /api/v1/stores/{storeId}/invoices/{invoiceId}/payment-methods
//        -> InvoicePaymentMethodData[]  (crypto amount + individual payments)
//
// The invoice list is the primary feed. Payment-methods is an optional per-invoice
// enrichment for the on-chain/Lightning amount actually paid and the received date;
// it is best-effort (never fails the feed) because it is one extra call per invoice.

/** Loose shape of Greenfield InvoiceData. Only the fields we normalize are typed. */
export interface BtcpayInvoice {
  id: string;
  storeId?: string;
  /** Fiat/display amount as a string, e.g. "1.00". */
  amount?: string;
  currency?: string;
  /** New | Processing | Settled | Expired | Invalid (+ legacy Paid/Complete/Confirmed). */
  status?: string;
  additionalStatus?: string;
  /** Unix seconds. */
  createdTime?: number;
  expirationTime?: number;
  checkoutLink?: string;
  type?: string;
  metadata?: Record<string, unknown> | null;
  checkout?: { paymentMethods?: string[]; [key: string]: unknown } | null;
  [key: string]: unknown;
}

/** A single on-chain/Lightning payment recorded against an invoice. */
export interface BtcpayInvoicePayment {
  /** Unix seconds the payment was seen. */
  receivedDate?: number;
  value?: string;
  status?: string;
  [key: string]: unknown;
}

/** Loose shape of Greenfield InvoicePaymentMethodData (field names vary by version). */
export interface BtcpayInvoicePaymentMethod {
  /** e.g. "BTC-CHAIN", "BTC-LN" (current) or "BTC" (legacy). */
  paymentMethodId?: string;
  /** Legacy fields carrying the same information. */
  cryptoCode?: string;
  paymentMethod?: string;
  currency?: string;
  /** Crypto amount due, as a string. */
  amount?: string;
  /** Crypto amount received, as a string. */
  totalPaid?: string;
  paymentMethodPaid?: string;
  due?: string;
  payments?: BtcpayInvoicePayment[];
  [key: string]: unknown;
}

export interface ListInvoicesParams {
  /** Unix seconds. */
  startDate?: number;
  /** Unix seconds. */
  endDate?: number;
  skip?: number;
  take?: number;
}

/**
 * Lists a store's invoices in a date range (newest first). Throws BtcpayApiError
 * on a non-2xx response (e.g. store missing / key lacks permission).
 */
export async function listStoreInvoices(
  config: BtcpayConfig,
  btcpayStoreId: string,
  params: ListInvoicesParams,
): Promise<BtcpayInvoice[]> {
  const qs = new URLSearchParams();
  if (params.startDate != null) qs.set('startDate', String(params.startDate));
  if (params.endDate != null) qs.set('endDate', String(params.endDate));
  if (params.skip != null) qs.set('skip', String(params.skip));
  if (params.take != null) qs.set('take', String(params.take));
  const query = qs.toString();
  const path =
    `/api/v1/stores/${encodeURIComponent(btcpayStoreId)}/invoices` +
    (query ? `?${query}` : '');

  const { status, ok, parsed } = await btcpayGet(config, path);
  if (ok) return Array.isArray(parsed) ? (parsed as BtcpayInvoice[]) : [];
  throw new BtcpayApiError(
    `BTCPay invoice listing failed (HTTP ${status}).`,
    status,
    parsed,
  );
}

/**
 * Reads the per-invoice payment methods (crypto amount + individual payments).
 * Best-effort: returns [] on any non-2xx or unexpected payload so a single
 * enrichment failure never breaks the activity feed. Network failures propagate.
 */
export async function getInvoicePaymentMethods(
  config: BtcpayConfig,
  btcpayStoreId: string,
  invoiceId: string,
): Promise<BtcpayInvoicePaymentMethod[]> {
  const { ok, parsed } = await btcpayGet(
    config,
    `/api/v1/stores/${encodeURIComponent(btcpayStoreId)}` +
      `/invoices/${encodeURIComponent(invoiceId)}/payment-methods`,
  );
  if (ok && Array.isArray(parsed)) return parsed as BtcpayInvoicePaymentMethod[];
  return [];
}
