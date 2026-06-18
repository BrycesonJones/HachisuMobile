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
import { updateDevStore } from '@/lib/btcpay/dev-stores';
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

  if (isProfileDebugEnabled) {
    console.log('[btcpay] preview-onchain result', {
      ok: !error && data?.ok,
      error: error?.message ?? data?.error,
    });
  }

  if (error) return { ok: false, error: error.message, addresses: [] };
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

  if (isProfileDebugEnabled) {
    console.log('[btcpay] connect-onchain result', {
      ok: !error && data?.ok,
      error: error?.message ?? data?.error,
    });
  }

  if (error) return { ok: false, error: error.message };
  if (!data?.ok) return { ok: false, error: data?.error ?? 'Connection failed.' };
  return { ok: true, error: null };
}
