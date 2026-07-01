// Client wrapper for the per-store Lightning (Boltz) settings flow.
//
// Mirrors lib/btcpay/onchain-wallet.ts. The mobile app never talks to BTCPay
// directly — it calls three Edge Functions:
//   get-lightning-settings     — enabled + description template + status
//   update-lightning-settings  — save enabled + description template (no reconnect)
//   remove-lightning           — remove BTC-LN + reset lightning_* fields
//
// The client never sees the connectionString / Boltz macaroon / node internals.
// Dev-bypass mode simulates all three against the in-memory dev store registry.

import { isProfileDebugEnabled } from '@/lib/auth/config';
import { isDevAuthActive } from '@/lib/auth/dev-session';
import { getDevStores, updateDevStore } from '@/lib/btcpay/dev-stores';
import { syncDevProfileSummary } from '@/lib/btcpay/stores';
import { supabase } from '@/lib/supabase';

export type LightningWalletStatus = 'connected' | 'disabled' | 'not_connected';

export interface LightningSettings {
  ok: boolean;
  error: string | null;
  status: LightningWalletStatus;
  enabled: boolean;
  descriptionTemplate: string | null;
}

export interface UpdateLightningSettingsInput {
  merchantStoreId: string;
  enabled: boolean;
  descriptionTemplate: string;
}

export interface RemoveLightningResult {
  ok: boolean;
  error: string | null;
}

/**
 * supabase-js throws FunctionsHttpError on any non-2xx response and exposes only
 * a generic message. The real { error } lives on error.context (the raw Response);
 * pull it out so the actual reason surfaces.
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

/** Reads the active store's Lightning settings (enabled + template + status). */
export async function getLightningSettings(
  merchantStoreId: string,
): Promise<LightningSettings> {
  const id = merchantStoreId.trim();

  if (isDevAuthActive()) {
    const store = getDevStores().find((s) => s.id === id) ?? null;
    const configured = store?.lightning_status === 'connected';
    const enabled = configured ? store?.lightning_enabled !== false : false;
    return {
      ok: true,
      error: null,
      status: !configured ? 'not_connected' : enabled ? 'connected' : 'disabled',
      enabled,
      descriptionTemplate: store?.lightning_description_template ?? null,
    };
  }

  const { data, error } = await supabase.functions.invoke<{
    ok?: boolean;
    error?: string;
    status?: LightningWalletStatus;
    enabled?: boolean;
    descriptionTemplate?: string | null;
  }>('get-lightning-settings', {
    method: 'POST',
    body: { merchantStoreId: id },
  });

  if (error) {
    const message = await extractFunctionError(error, 'Could not load settings.');
    return { ok: false, error: message, status: 'not_connected', enabled: false, descriptionTemplate: null };
  }
  if (!data?.ok) {
    return {
      ok: false,
      error: data?.error ?? 'Could not load settings.',
      status: 'not_connected',
      enabled: false,
      descriptionTemplate: null,
    };
  }
  return {
    ok: true,
    error: null,
    status: data.status ?? 'not_connected',
    enabled: data.enabled ?? false,
    descriptionTemplate: data.descriptionTemplate ?? null,
  };
}

/** Saves the enabled flag + description template for the active store's Lightning. */
export async function updateLightningSettings(
  input: UpdateLightningSettingsInput,
): Promise<LightningSettings> {
  const id = input.merchantStoreId.trim();
  const descriptionTemplate = input.descriptionTemplate;

  if (isDevAuthActive()) {
    updateDevStore(id, {
      lightning_enabled: input.enabled,
      lightning_description_template: descriptionTemplate || null,
    });
    syncDevProfileSummary();
    return {
      ok: true,
      error: null,
      status: input.enabled ? 'connected' : 'disabled',
      enabled: input.enabled,
      descriptionTemplate: descriptionTemplate || null,
    };
  }

  const { data, error } = await supabase.functions.invoke<{
    ok?: boolean;
    error?: string;
    status?: LightningWalletStatus;
    enabled?: boolean;
    descriptionTemplate?: string | null;
  }>('update-lightning-settings', {
    method: 'POST',
    body: { merchantStoreId: id, enabled: input.enabled, descriptionTemplate },
  });

  if (error) {
    const message = await extractFunctionError(error, 'Could not save settings.');
    return { ok: false, error: message, status: 'not_connected', enabled: false, descriptionTemplate: null };
  }
  if (!data?.ok) {
    return {
      ok: false,
      error: data?.error ?? 'Could not save settings.',
      status: 'not_connected',
      enabled: false,
      descriptionTemplate: null,
    };
  }
  return {
    ok: true,
    error: null,
    status: data.status ?? (input.enabled ? 'connected' : 'disabled'),
    enabled: data.enabled ?? input.enabled,
    descriptionTemplate: data.descriptionTemplate ?? (descriptionTemplate || null),
  };
}

/** Removes the Lightning connection from the active store (BTCPay + Supabase). */
export async function removeLightning(
  merchantStoreId: string,
): Promise<RemoveLightningResult> {
  const id = merchantStoreId.trim();

  if (isDevAuthActive()) {
    updateDevStore(id, {
      lightning_status: 'not_connected',
      lightning_provider: null,
      lightning_configured_at: null,
      lightning_error: null,
      lightning_enabled: false,
      lightning_label: null,
      lightning_description_template: null,
      // Keep payment-destination if on-chain is still connected.
      wallet_status:
        getDevStores().find((s) => s.id === id)?.onchain_status === 'connected'
          ? 'payment_destination_connected'
          : 'store_created',
    });
    syncDevProfileSummary();
    return { ok: true, error: null };
  }

  const { data, error } = await supabase.functions.invoke<{ ok?: boolean; error?: string }>(
    'remove-lightning',
    { method: 'POST', body: { merchantStoreId: id } },
  );

  if (error) {
    const message = await extractFunctionError(error, 'Could not remove the connection.');
    if (isProfileDebugEnabled) console.log('[btcpay] remove-lightning error', message);
    return { ok: false, error: message };
  }
  if (!data?.ok) return { ok: false, error: data?.error ?? 'Could not remove the connection.' };
  return { ok: true, error: null };
}
