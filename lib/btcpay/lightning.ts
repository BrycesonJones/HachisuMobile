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
  code?: 'BOLTZ_PLUGIN_NOT_AVAILABLE' | 'BOLTZ_API_UNSUPPORTED';
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

  if (error) return { ok: false, error: error.message };
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
