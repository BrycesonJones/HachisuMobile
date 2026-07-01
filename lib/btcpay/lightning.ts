// Client wrapper for the per-store Lightning (Boltz) connection flow.
//
// The mobile app NEVER talks to BTCPay directly. Hachisu uses the BTCPay Boltz
// plugin for Lightning and hides BTCPay's "connect a Lightning node" choice
// (internal node / custom node / Configure Boltz) entirely. The merchant only
// ever sees the L-BTC wallet setup that follows once Boltz is ready.
//
// Phase 1 calls a single Edge Function, prepare-btcpay-boltz-lightning, which
// detects Boltz availability for the store and marks it pending_lbtc_wallet.
// Dev-bypass mode simulates the call against the in-memory dev store registry.

import { isProfileDebugEnabled } from '@/lib/auth/config';
import { isDevAuthActive } from '@/lib/auth/dev-session';
import { updateDevStore } from '@/lib/btcpay/dev-stores';
import { syncDevProfileSummary } from '@/lib/btcpay/stores';
import { supabase } from '@/lib/supabase';

/** Transitional Lightning status returned by the prepare step. */
export type PrepareLightningStatus = 'pending_lbtc_wallet' | 'connected';

export interface PrepareBoltzLightningInput {
  merchantStoreId: string;
}

export interface PrepareBoltzLightningResult {
  ok: boolean;
  /** null on success; a user-facing message otherwise. */
  error: string | null;
  /** Stable machine code on the expected failure outcomes (Boltz unavailable). */
  code?: 'BOLTZ_PLUGIN_NOT_AVAILABLE' | 'BOLTZ_API_UNSUPPORTED' | 'BOLTZ_DAEMON_UNAVAILABLE';
  status?: PrepareLightningStatus;
  /** 'setup_lbtc_wallet' once Boltz is ready; 'none' if already connected. */
  nextStep?: 'setup_lbtc_wallet' | 'none';
}

/** A transient, network-level fetch failure (no HTTP response). On the iOS
 * simulator these happen sporadically; a single retry clears them. */
function isTransientFetchError(error: unknown): boolean {
  return (
    !!error &&
    typeof error === 'object' &&
    (error as { name?: string }).name === 'FunctionsFetchError'
  );
}

/**
 * supabase-js collapses any non-2xx Edge Function response into a generic
 * "Edge Function returned a non-2xx status code" and hides the JSON body. The
 * real `{ error, code }` we returned lives on error.context (the raw Response).
 * This recovers it so the UI can show the actual server message.
 */
async function readFunctionError(
  error: unknown,
): Promise<{ error?: string; code?: string } | undefined> {
  const ctx = (error as { context?: unknown })?.context;
  if (ctx && typeof (ctx as Response).json === 'function') {
    try {
      const body = await (ctx as Response).clone().json();
      if (body && typeof body === 'object') return body as { error?: string; code?: string };
    } catch {
      // Body was not JSON — fall back to the generic message.
    }
  }
  return undefined;
}

/**
 * Prepares Boltz Lightning for a store. Detection + transitional state only —
 * the L-BTC descriptor import is a later step. Idempotent, so a single retry on
 * a transient network failure is safe.
 */
export async function prepareBoltzLightning(
  input: PrepareBoltzLightningInput,
): Promise<PrepareBoltzLightningResult> {
  const merchantStoreId = input.merchantStoreId.trim();
  if (!merchantStoreId) {
    return { ok: false, error: 'No store selected.' };
  }

  if (isDevAuthActive()) {
    // Simulate a successful Boltz readiness check.
    updateDevStore(merchantStoreId, {
      lightning_status: 'pending_lbtc_wallet',
      lightning_provider: 'boltz',
      lightning_configured_at: new Date().toISOString(),
      lightning_error: null,
    });
    syncDevProfileSummary();
    return {
      ok: true,
      error: null,
      status: 'pending_lbtc_wallet',
      nextStep: 'setup_lbtc_wallet',
    };
  }

  const options = { method: 'POST', body: { merchantStoreId } } as const;
  let { data, error } = await supabase.functions.invoke<{
    ok?: boolean;
    error?: string;
    code?: PrepareBoltzLightningResult['code'];
    status?: PrepareLightningStatus;
    nextStep?: PrepareBoltzLightningResult['nextStep'];
  }>('prepare-btcpay-boltz-lightning', options);
  if (error && isTransientFetchError(error)) {
    ({ data, error } = await supabase.functions.invoke('prepare-btcpay-boltz-lightning', options));
  }

  if (isProfileDebugEnabled) {
    console.log('[btcpay] prepare-boltz result', {
      ok: !error && data?.ok,
      code: data?.code,
      status: data?.status,
      error: error?.message ?? data?.error,
    });
  }

  if (error) {
    const server = await readFunctionError(error);
    return {
      ok: false,
      error: server?.error ?? error.message,
      code: server?.code as PrepareBoltzLightningResult['code'],
    };
  }
  if (!data?.ok) {
    return {
      ok: false,
      error: data?.error ?? 'Could not prepare Lightning. Please try again.',
      code: data?.code,
    };
  }
  return {
    ok: true,
    error: null,
    status: data.status,
    nextStep: data.nextStep,
  };
}

export interface ConnectLbtcWalletInput {
  merchantStoreId: string;
  /** Read-only L-BTC core descriptor. Treated as sensitive — never logged. */
  coreDescriptor: string;
  /** Optional Boltz wallet name (defaults server-side to "lightning"). */
  walletName?: string;
}

export interface ConnectLbtcWalletResult {
  ok: boolean;
  /** null on success; a user-facing message otherwise. */
  error: string | null;
  code?: 'BOLTZ_PLUGIN_NOT_AVAILABLE' | 'BOLTZ_API_UNSUPPORTED' | 'BOLTZ_DAEMON_UNAVAILABLE';
}

/**
 * Imports a read-only L-BTC descriptor and connects Lightning (Boltz) for the
 * store via the connect-btcpay-lbtc-wallet Edge Function. On success the store's
 * lightning_status becomes 'connected'.
 *
 * The descriptor is sensitive: it is sent to the backend but NEVER logged here,
 * and is not persisted on the device beyond the in-flight call. The backend
 * dedupes by wallet name, so a single retry on a transient fetch failure is safe.
 */
export async function connectLbtcWallet(
  input: ConnectLbtcWalletInput,
): Promise<ConnectLbtcWalletResult> {
  const merchantStoreId = input.merchantStoreId.trim();
  const coreDescriptor = input.coreDescriptor.trim();
  const walletName = input.walletName?.trim() || undefined;

  if (!merchantStoreId) return { ok: false, error: 'No store selected.' };
  if (!coreDescriptor) return { ok: false, error: 'A core descriptor is required.' };

  if (isDevAuthActive()) {
    // Simulate a successful connection.
    updateDevStore(merchantStoreId, {
      lightning_status: 'connected',
      lightning_provider: 'boltz',
      lightning_configured_at: new Date().toISOString(),
      lightning_error: null,
    });
    syncDevProfileSummary();
    return { ok: true, error: null };
  }

  const options = {
    method: 'POST',
    body: { merchantStoreId, coreDescriptor, walletName },
  } as const;
  let { data, error } = await supabase.functions.invoke<{
    ok?: boolean;
    error?: string;
    code?: ConnectLbtcWalletResult['code'];
  }>('connect-btcpay-lbtc-wallet', options);
  if (error && isTransientFetchError(error)) {
    ({ data, error } = await supabase.functions.invoke('connect-btcpay-lbtc-wallet', options));
  }

  if (isProfileDebugEnabled) {
    // NEVER log the descriptor — only the outcome.
    console.log('[btcpay] connect-lbtc result', {
      ok: !error && data?.ok,
      code: data?.code,
      error: error?.message ?? data?.error,
    });
  }

  if (error) {
    const server = await readFunctionError(error);
    return {
      ok: false,
      error: server?.error ?? error.message,
      code: server?.code as ConnectLbtcWalletResult['code'],
    };
  }
  if (!data?.ok) {
    return {
      ok: false,
      error: data?.error ?? 'Could not connect the wallet. Please try again.',
      code: data?.code,
    };
  }
  return { ok: true, error: null };
}
