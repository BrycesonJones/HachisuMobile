// Client wrapper for the per-store on-chain (Bitcoin) wallet connection flow.
//
// The mobile app NEVER talks to BTCPay directly — it calls two Supabase Edge
// Functions:
//   1. preview-btcpay-onchain-wallet — derive receive addresses for confirmation
//   2. connect-btcpay-onchain-wallet — save the wallet to the store + persist
//
// We send the extended public key, but it is public-key material and is not
// stored on the device beyond the in-flight flow. Dev-bypass mode simulates both
// calls against the in-memory dev store registry.

import { isProfileDebugEnabled } from '@/lib/auth/config';
import { isDevAuthActive } from '@/lib/auth/dev-session';
import { getDevStores, updateDevStore } from '@/lib/btcpay/dev-stores';
import { syncDevProfileSummary } from '@/lib/btcpay/stores';
import { supabase } from '@/lib/supabase';

export interface PreviewAddress {
  keyPath: string;
  address: string;
}

export interface PreviewOnchainWalletInput {
  merchantStoreId: string;
  extendedPublicKey: string;
}

export interface PreviewOnchainWalletResult {
  ok: boolean;
  error: string | null;
  /** Machine-readable code, e.g. WALLET_ALREADY_CONNECTED for a connected store. */
  code?: string | null;
  addressType?: string;
  addresses: PreviewAddress[];
}

export interface ConnectOnchainWalletInput {
  merchantStoreId: string;
  extendedPublicKey: string;
  confirmedAddresses: PreviewAddress[];
}

export interface ConnectOnchainWalletResult {
  ok: boolean;
  error: string | null;
  /** Machine-readable code, e.g. WALLET_ALREADY_CONNECTED when connect is refused. */
  code?: string | null;
}

/**
 * supabase-js throws FunctionsHttpError on any non-2xx response and exposes only
 * a generic message ("Edge Function returned a non-2xx status code"). The actual
 * JSON body our function returned ({ error }) lives on error.context (the raw
 * Response). Pull it out so the real reason (e.g. BTCPay HTTP 403) surfaces.
 */
async function extractFunctionError(error: unknown, fallback: string): Promise<string> {
  return (await extractFunctionErrorDetail(error, fallback)).message;
}

/**
 * Like extractFunctionError, but also surfaces the machine-readable `code` and
 * `reconcile` flag our newer functions return, so callers can branch on the exact
 * failure (preview expired, verification failed, reconcile-required, etc.).
 */
async function extractFunctionErrorDetail(
  error: unknown,
  fallback: string,
): Promise<{ message: string; code: string | null; reconcile: boolean }> {
  const ctx = (error as { context?: unknown })?.context;
  if (ctx && typeof (ctx as Response).json === 'function') {
    try {
      const body = await (ctx as Response).clone().json();
      if (body && typeof body === 'object') {
        const message =
          typeof body.error === 'string' && body.error
            ? body.error
            : (error as { message?: string })?.message || fallback;
        return {
          message,
          code: typeof body.code === 'string' ? body.code : null,
          reconcile: body.reconcile === true,
        };
      }
    } catch {
      // Body wasn't JSON or already consumed — fall through.
    }
  }
  const message = (error as { message?: string })?.message;
  return { message: message || fallback, code: null, reconcile: false };
}

/** A stable idempotency key for one replacement submission (survives double-taps). */
export function newReplacementIdempotencyKey(): string {
  return `repl-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Best-effort, non-authoritative classification for the dev simulation only. */
function devClassify(input: string): { provider: string; addressType: string } {
  const v = input.trim();
  if (v.includes('(')) return { provider: 'descriptor', addressType: 'Descriptor' };
  const prefix = v.slice(0, 4).toLowerCase();
  if (prefix === 'zpub' || prefix === 'vpub')
    return { provider: 'xpub', addressType: 'P2WPKH (SegWit)' };
  if (prefix === 'ypub' || prefix === 'upub')
    return { provider: 'xpub', addressType: 'P2SH-P2WPKH' };
  return { provider: 'xpub', addressType: 'P2PKH (Legacy)' };
}

/**
 * Step 1: ask BTCPay (via the edge function) to derive the first receive
 * addresses for the supplied key so the merchant can confirm them.
 */
export async function previewOnchainWallet(
  input: PreviewOnchainWalletInput,
): Promise<PreviewOnchainWalletResult> {
  const merchantStoreId = input.merchantStoreId.trim();
  const extendedPublicKey = input.extendedPublicKey.trim();

  if (isDevAuthActive()) {
    // Mirror the server connect-guard: a connected store can't use connect preview.
    const devStore = getDevStores().find((s) => s.id === merchantStoreId) ?? null;
    if (devStore?.onchain_status === 'connected') {
      return {
        ok: false,
        code: 'WALLET_ALREADY_CONNECTED',
        error: 'This store already has a Bitcoin wallet connected. Use Replace wallet to change it.',
        addresses: [],
      };
    }
    // Simulate BTCPay-derived addresses (0/0 … 0/9). Not real addresses.
    const { addressType } = devClassify(extendedPublicKey);
    const addresses: PreviewAddress[] = Array.from({ length: 10 }, (_, i) => ({
      keyPath: `0/${i}`,
      address: `bc1qdev${extendedPublicKey.slice(4, 10).toLowerCase()}${i}xxxxxxxxxxxxxxxxxxxx`,
    }));
    return { ok: true, error: null, code: null, addressType, addresses };
  }

  const { data, error } = await supabase.functions.invoke<{
    ok?: boolean;
    error?: string;
    code?: string;
    addressType?: string;
    addresses?: PreviewAddress[];
  }>('preview-btcpay-onchain-wallet', {
    method: 'POST',
    body: { merchantStoreId, extendedPublicKey },
  });

  if (error) {
    const detail = await extractFunctionErrorDetail(error, 'Preview failed.');
    if (isProfileDebugEnabled) console.log('[btcpay] preview-onchain error', detail);
    return { ok: false, error: detail.message, code: detail.code, addresses: [] };
  }

  if (isProfileDebugEnabled) {
    console.log('[btcpay] preview-onchain result', { ok: data?.ok, error: data?.error });
  }

  if (!data?.ok) {
    return { ok: false, error: data?.error ?? 'Preview failed.', code: data?.code ?? null, addresses: [] };
  }
  return {
    ok: true,
    error: null,
    code: null,
    addressType: data.addressType,
    addresses: data.addresses ?? [],
  };
}

/**
 * Step 2: finalize the connection — save the wallet to the store at BTCPay and
 * mark the Supabase store row connected. Only succeeds once BTCPay confirms.
 */
export async function connectOnchainWallet(
  input: ConnectOnchainWalletInput,
): Promise<ConnectOnchainWalletResult> {
  const merchantStoreId = input.merchantStoreId.trim();
  const extendedPublicKey = input.extendedPublicKey.trim();

  if (isDevAuthActive()) {
    // Mirror the server connect-guard: never overwrite an already-connected store.
    const devStore = getDevStores().find((s) => s.id === merchantStoreId) ?? null;
    if (devStore?.onchain_status === 'connected') {
      return {
        ok: false,
        code: 'WALLET_ALREADY_CONNECTED',
        error: 'This store already has a Bitcoin wallet connected. Use Replace wallet to change it.',
      };
    }
    const { provider, addressType } = devClassify(extendedPublicKey);
    updateDevStore(merchantStoreId, {
      onchain_status: 'connected',
      onchain_provider: provider,
      onchain_address_type: addressType,
      onchain_wallet_configured_at: new Date().toISOString(),
      wallet_status: 'payment_destination_connected',
    });
    syncDevProfileSummary();
    return { ok: true, error: null, code: null };
  }

  const { data, error } = await supabase.functions.invoke<{
    ok?: boolean;
    error?: string;
    code?: string;
  }>('connect-btcpay-onchain-wallet', {
    method: 'POST',
    body: { merchantStoreId, extendedPublicKey, confirmedAddresses: input.confirmedAddresses },
  });

  if (error) {
    const detail = await extractFunctionErrorDetail(error, 'Connection failed.');
    if (isProfileDebugEnabled) console.log('[btcpay] connect-onchain error', detail);
    return { ok: false, error: detail.message, code: detail.code };
  }

  if (isProfileDebugEnabled) {
    console.log('[btcpay] connect-onchain result', { ok: data?.ok, error: data?.error });
  }

  if (!data?.ok) return { ok: false, error: data?.error ?? 'Connection failed.', code: data?.code ?? null };
  return { ok: true, error: null, code: null };
}

// ---------------------------------------------------------------------------
// Staged on-chain wallet REPLACEMENT
// ---------------------------------------------------------------------------
//
// Replacement is a two-step, server-verified flow, distinct from the initial
// connect. The current wallet stays active until BTCPay confirms the new one:
//   1. previewOnchainWalletReplacement — derive addresses + get a single-use,
//      store/user/scheme-bound preview-verification token. No wallet change.
//   2. replaceOnchainWallet — commit, requiring the token + an idempotency key.
//      Only reports success after BTCPay read-back + DB sync.

export interface PreviewReplacementResult {
  ok: boolean;
  error: string | null;
  code: string | null;
  previewVerificationId?: string;
  addressType?: string;
  addresses: PreviewAddress[];
  expiresAt?: string;
  storeName?: string;
}

export async function previewOnchainWalletReplacement(
  input: PreviewOnchainWalletInput,
): Promise<PreviewReplacementResult> {
  const merchantStoreId = input.merchantStoreId.trim();
  const extendedPublicKey = input.extendedPublicKey.trim();

  if (isDevAuthActive()) {
    const { addressType } = devClassify(extendedPublicKey);
    const addresses: PreviewAddress[] = Array.from({ length: 10 }, (_, i) => ({
      keyPath: `0/${i}`,
      address: `bc1qrepl${extendedPublicKey.slice(4, 10).toLowerCase()}${i}xxxxxxxxxxxxxxxxxxxx`,
    }));
    const store = getDevStores().find((s) => s.id === merchantStoreId) ?? null;
    return {
      ok: true,
      error: null,
      code: null,
      previewVerificationId: `dev-preview-${Date.now()}`,
      addressType,
      addresses,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      storeName: store?.name ?? undefined,
    };
  }

  const { data, error } = await supabase.functions.invoke<{
    ok?: boolean;
    error?: string;
    code?: string;
    previewVerificationId?: string;
    addressType?: string;
    addresses?: PreviewAddress[];
    expiresAt?: string;
    storeName?: string;
  }>('preview-btcpay-onchain-wallet-replacement', {
    method: 'POST',
    body: { merchantStoreId, extendedPublicKey },
  });

  if (error) {
    const detail = await extractFunctionErrorDetail(error, 'Preview failed.');
    if (isProfileDebugEnabled) console.log('[btcpay] preview-replace error', detail);
    return { ok: false, error: detail.message, code: detail.code, addresses: [] };
  }
  if (!data?.ok) {
    return { ok: false, error: data?.error ?? 'Preview failed.', code: data?.code ?? null, addresses: [] };
  }
  return {
    ok: true,
    error: null,
    code: null,
    previewVerificationId: data.previewVerificationId,
    addressType: data.addressType,
    addresses: data.addresses ?? [],
    expiresAt: data.expiresAt,
    storeName: data.storeName,
  };
}

export interface ReplaceOnchainWalletInput {
  merchantStoreId: string;
  previewVerificationId: string;
  extendedPublicKey: string;
  idempotencyKey: string;
}

export interface ReplaceOnchainWalletResult {
  ok: boolean;
  error: string | null;
  code: string | null;
  /** True when BTCPay may have changed but the app couldn't verify/save cleanly. */
  reconcile: boolean;
  status?: string;
  enabled?: boolean;
  label?: string | null;
}

export async function replaceOnchainWallet(
  input: ReplaceOnchainWalletInput,
): Promise<ReplaceOnchainWalletResult> {
  const merchantStoreId = input.merchantStoreId.trim();
  const extendedPublicKey = input.extendedPublicKey.trim();

  if (isDevAuthActive()) {
    const store = getDevStores().find((s) => s.id === merchantStoreId) ?? null;
    const { provider, addressType } = devClassify(extendedPublicKey);
    updateDevStore(merchantStoreId, {
      onchain_status: 'connected',
      onchain_provider: provider,
      onchain_address_type: addressType,
      onchain_wallet_configured_at: new Date().toISOString(),
      // Preserve the merchant's enabled state + label across a replacement.
      onchain_enabled: store?.onchain_enabled ?? true,
      onchain_label: store?.onchain_label ?? null,
      wallet_status: 'payment_destination_connected',
    });
    syncDevProfileSummary();
    return {
      ok: true,
      error: null,
      code: null,
      reconcile: false,
      status: 'connected',
      enabled: store?.onchain_enabled ?? true,
      label: store?.onchain_label ?? null,
    };
  }

  const { data, error } = await supabase.functions.invoke<{
    ok?: boolean;
    error?: string;
    code?: string;
    reconcile?: boolean;
    status?: string;
    enabled?: boolean;
    label?: string | null;
  }>('replace-btcpay-onchain-wallet', {
    method: 'POST',
    body: {
      merchantStoreId,
      previewVerificationId: input.previewVerificationId,
      extendedPublicKey,
      idempotencyKey: input.idempotencyKey,
    },
  });

  if (error) {
    const detail = await extractFunctionErrorDetail(error, 'Replacement failed.');
    if (isProfileDebugEnabled) console.log('[btcpay] replace-onchain error', detail);
    return { ok: false, error: detail.message, code: detail.code, reconcile: detail.reconcile };
  }
  if (!data?.ok) {
    return {
      ok: false,
      error: data?.error ?? 'Replacement failed.',
      code: data?.code ?? null,
      reconcile: data?.reconcile === true,
    };
  }
  return {
    ok: true,
    error: null,
    code: null,
    reconcile: false,
    status: data.status,
    enabled: data.enabled,
    label: data.label ?? null,
  };
}

/**
 * Retry-state-sync: re-reads the authoritative BTCPay wallet state and saves it,
 * clearing any stuck operation lock. Used to recover from a reconcile-required
 * replacement result — NOT another replace.
 */
export async function resyncOnchainWallet(
  merchantStoreId: string,
): Promise<OnchainWalletSettings> {
  const id = merchantStoreId.trim();

  if (isDevAuthActive()) {
    const store = getDevStores().find((s) => s.id === id) ?? null;
    const configured = store?.onchain_status === 'connected';
    const enabled = configured ? store?.onchain_enabled !== false : false;
    return {
      ok: true,
      error: null,
      status: !configured ? 'not_connected' : enabled ? 'connected' : 'disabled',
      enabled,
      label: store?.onchain_label ?? null,
    };
  }

  const { data, error } = await supabase.functions.invoke<{
    ok?: boolean;
    error?: string;
    status?: OnchainWalletStatus;
    enabled?: boolean;
    label?: string | null;
  }>('sync-btcpay-onchain-wallet', {
    method: 'POST',
    body: { merchantStoreId: id },
  });

  if (error) {
    const message = await extractFunctionError(error, 'Could not re-check the wallet.');
    return { ok: false, error: message, status: 'not_connected', enabled: false, label: null };
  }
  if (!data?.ok) {
    return {
      ok: false,
      error: data?.error ?? 'Could not re-check the wallet.',
      status: 'not_connected',
      enabled: false,
      label: null,
    };
  }
  return {
    ok: true,
    error: null,
    status: data.status ?? 'not_connected',
    enabled: data.enabled ?? false,
    label: data.label ?? null,
  };
}

// ---------------------------------------------------------------------------
// BTC Wallet Settings (read / update enabled+label / remove)
// ---------------------------------------------------------------------------

export type OnchainWalletStatus = 'connected' | 'disabled' | 'not_connected';

export interface OnchainWalletSettings {
  ok: boolean;
  error: string | null;
  status: OnchainWalletStatus;
  enabled: boolean;
  label: string | null;
}

/** Reads the active store's on-chain wallet settings (enabled + label + status). */
export async function getOnchainWalletSettings(
  merchantStoreId: string,
): Promise<OnchainWalletSettings> {
  const id = merchantStoreId.trim();

  if (isDevAuthActive()) {
    const store = getDevStores().find((s) => s.id === id) ?? null;
    const configured = store?.onchain_status === 'connected';
    const enabled = configured ? store?.onchain_enabled !== false : false;
    return {
      ok: true,
      error: null,
      status: !configured ? 'not_connected' : enabled ? 'connected' : 'disabled',
      enabled,
      label: store?.onchain_label ?? null,
    };
  }

  const { data, error } = await supabase.functions.invoke<{
    ok?: boolean;
    error?: string;
    status?: OnchainWalletStatus;
    enabled?: boolean;
    label?: string | null;
  }>('get-btcpay-onchain-wallet-settings', {
    method: 'POST',
    body: { merchantStoreId: id },
  });

  if (error) {
    const message = await extractFunctionError(error, 'Could not load settings.');
    return { ok: false, error: message, status: 'not_connected', enabled: false, label: null };
  }
  if (!data?.ok) {
    return {
      ok: false,
      error: data?.error ?? 'Could not load settings.',
      status: 'not_connected',
      enabled: false,
      label: null,
    };
  }
  return {
    ok: true,
    error: null,
    status: data.status ?? 'not_connected',
    enabled: data.enabled ?? false,
    label: data.label ?? null,
  };
}

export interface UpdateOnchainWalletSettingsInput {
  merchantStoreId: string;
  enabled: boolean;
  label: string;
}

/** Saves the enabled flag + label for the active store's on-chain wallet. */
export async function updateOnchainWalletSettings(
  input: UpdateOnchainWalletSettingsInput,
): Promise<OnchainWalletSettings> {
  const id = input.merchantStoreId.trim();
  const label = input.label.trim();

  if (isDevAuthActive()) {
    updateDevStore(id, { onchain_enabled: input.enabled, onchain_label: label || null });
    syncDevProfileSummary();
    return {
      ok: true,
      error: null,
      status: input.enabled ? 'connected' : 'disabled',
      enabled: input.enabled,
      label: label || null,
    };
  }

  const { data, error } = await supabase.functions.invoke<{
    ok?: boolean;
    error?: string;
    status?: OnchainWalletStatus;
    enabled?: boolean;
    label?: string | null;
  }>('update-btcpay-onchain-wallet-settings', {
    method: 'POST',
    body: { merchantStoreId: id, enabled: input.enabled, label },
  });

  if (error) {
    const message = await extractFunctionError(error, 'Could not save settings.');
    return { ok: false, error: message, status: 'not_connected', enabled: false, label: null };
  }
  if (!data?.ok) {
    return {
      ok: false,
      error: data?.error ?? 'Could not save settings.',
      status: 'not_connected',
      enabled: false,
      label: null,
    };
  }
  return {
    ok: true,
    error: null,
    status: data.status ?? (input.enabled ? 'connected' : 'disabled'),
    enabled: data.enabled ?? input.enabled,
    label: data.label ?? (label || null),
  };
}

/** Removes the on-chain wallet from the active store (BTCPay + Supabase). */
export async function removeOnchainWallet(
  merchantStoreId: string,
): Promise<ConnectOnchainWalletResult> {
  const id = merchantStoreId.trim();

  if (isDevAuthActive()) {
    updateDevStore(id, {
      onchain_status: 'not_connected',
      onchain_provider: null,
      onchain_address_type: null,
      onchain_wallet_configured_at: null,
      onchain_enabled: false,
      onchain_label: null,
      // Keep payment-destination if Lightning is still connected.
      wallet_status:
        getDevStores().find((s) => s.id === id)?.lightning_status === 'connected'
          ? 'payment_destination_connected'
          : 'store_created',
    });
    syncDevProfileSummary();
    return { ok: true, error: null };
  }

  const { data, error } = await supabase.functions.invoke<{ ok?: boolean; error?: string }>(
    'remove-btcpay-onchain-wallet',
    { method: 'POST', body: { merchantStoreId: id } },
  );

  if (error) {
    const message = await extractFunctionError(error, 'Could not remove the wallet.');
    return { ok: false, error: message };
  }
  if (!data?.ok) return { ok: false, error: data?.error ?? 'Could not remove the wallet.' };
  return { ok: true, error: null };
}
