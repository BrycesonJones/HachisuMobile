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
