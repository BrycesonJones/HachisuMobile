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
}

/**
 * supabase-js throws FunctionsHttpError on any non-2xx response and exposes only
 * a generic message ("Edge Function returned a non-2xx status code"). The actual
 * JSON body our function returned ({ error }) lives on error.context (the raw
 * Response). Pull it out so the real reason (e.g. BTCPay HTTP 403) surfaces.
 */
async function extractFunctionError(error: unknown, fallback: string): Promise<string> {
  const ctx = (error as { context?: unknown })?.context;
  if (ctx && typeof (ctx as Response).json === 'function') {
    try {
      const body = await (ctx as Response).clone().json();
      if (body && typeof body.error === 'string' && body.error) return body.error;
    } catch {
      // Body wasn't JSON or already consumed — fall through.
    }
  }
  const message = (error as { message?: string })?.message;
  return message || fallback;
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
    // Simulate BTCPay-derived addresses (0/0 … 0/9). Not real addresses.
    const { addressType } = devClassify(extendedPublicKey);
    const addresses: PreviewAddress[] = Array.from({ length: 10 }, (_, i) => ({
      keyPath: `0/${i}`,
      address: `bc1qdev${extendedPublicKey.slice(4, 10).toLowerCase()}${i}xxxxxxxxxxxxxxxxxxxx`,
    }));
    return { ok: true, error: null, addressType, addresses };
  }

  const { data, error } = await supabase.functions.invoke<{
    ok?: boolean;
    error?: string;
    addressType?: string;
    addresses?: PreviewAddress[];
  }>('preview-btcpay-onchain-wallet', {
    method: 'POST',
    body: { merchantStoreId, extendedPublicKey },
  });

  if (error) {
    const message = await extractFunctionError(error, 'Preview failed.');
    if (isProfileDebugEnabled) console.log('[btcpay] preview-onchain error', message);
    return { ok: false, error: message, addresses: [] };
  }

  if (isProfileDebugEnabled) {
    console.log('[btcpay] preview-onchain result', { ok: data?.ok, error: data?.error });
  }

  if (!data?.ok) return { ok: false, error: data?.error ?? 'Preview failed.', addresses: [] };
  return {
    ok: true,
    error: null,
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
    const { provider, addressType } = devClassify(extendedPublicKey);
    updateDevStore(merchantStoreId, {
      onchain_status: 'connected',
      onchain_provider: provider,
      onchain_address_type: addressType,
      onchain_wallet_configured_at: new Date().toISOString(),
      wallet_status: 'payment_destination_connected',
    });
    syncDevProfileSummary();
    return { ok: true, error: null };
  }

  const { data, error } = await supabase.functions.invoke<{ ok?: boolean; error?: string }>(
    'connect-btcpay-onchain-wallet',
    {
      method: 'POST',
      body: { merchantStoreId, extendedPublicKey, confirmedAddresses: input.confirmedAddresses },
    },
  );

  if (error) {
    const message = await extractFunctionError(error, 'Connection failed.');
    if (isProfileDebugEnabled) console.log('[btcpay] connect-onchain error', message);
    return { ok: false, error: message };
  }

  if (isProfileDebugEnabled) {
    console.log('[btcpay] connect-onchain result', { ok: data?.ok, error: data?.error });
  }

  if (!data?.ok) return { ok: false, error: data?.error ?? 'Connection failed.' };
  return { ok: true, error: null };
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
