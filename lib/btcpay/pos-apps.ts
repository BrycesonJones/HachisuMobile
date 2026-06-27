import { isDevAuthActive } from '@/lib/auth/dev-session';
import {
  addDevPosApp,
  getDevPosApp,
  getDevPosApps,
  updateDevPosApp,
} from '@/lib/btcpay/dev-pos-apps';
import { supabase } from '@/lib/supabase';
import type { PosApp } from '@/types/pos-app';

export interface CreatePosAppInput {
  merchantStoreId: string;
  appName: string;
}

export interface CreatePosAppResult {
  posApp?: PosApp;
  error: string | null;
}

/** Best-effort extraction of the server-side `{ error }` from a non-2xx
 * functions.invoke response (supabase-js otherwise gives a generic message). */
async function readFunctionError(error: unknown): Promise<string | undefined> {
  const context = (error as { context?: unknown })?.context;
  if (context && typeof (context as Response).json === 'function') {
    try {
      const body = await (context as Response).json();
      if (body && typeof body.error === 'string') return body.error;
    } catch {
      // Fall through to the generic message.
    }
  }
  return undefined;
}

/** Fetches the POS apps for a single merchant store (newest first). */
export async function fetchPosApps(merchantStoreId: string): Promise<PosApp[]> {
  if (isDevAuthActive()) {
    return getDevPosApps().filter((a) => a.merchant_store_id === merchantStoreId);
  }

  const { data, error } = await supabase
    .from('merchant_pos_apps')
    .select('*')
    .eq('merchant_store_id', merchantStoreId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return data ?? [];
}

/** Fetches a single POS app by id (RLS scopes it to the owner). */
export async function fetchPosApp(id: string): Promise<PosApp | null> {
  if (isDevAuthActive()) {
    return getDevPosApp(id) ?? null;
  }

  const { data, error } = await supabase
    .from('merchant_pos_apps')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data ?? null;
}

/**
 * Creates a POS app via the create-btcpay-pos-app Edge Function. The mobile app
 * never calls BTCPay directly. Dev-bypass mode simulates against the in-memory
 * registry.
 */
export async function createPosApp(input: CreatePosAppInput): Promise<CreatePosAppResult> {
  const appName = input.appName.trim();

  if (isDevAuthActive()) {
    const now = new Date().toISOString();
    const seq = getDevPosApps().length + 1;
    const posApp: PosApp = {
      id: `dev-pos-${seq}`,
      user_id: 'dev-user-id',
      merchant_store_id: input.merchantStoreId,
      btcpay_store_id: 'dev-btcpay-store',
      btcpay_app_id: `dev-pos-app-${seq}`,
      app_name: appName,
      display_title: appName,
      pos_style: 'product-list',
      currency: 'USD',
      description: null,
      status: 'active',
      metadata: {},
      created_at: now,
      updated_at: now,
    };
    addDevPosApp(posApp);
    return { posApp, error: null };
  }

  const { data, error } = await supabase.functions.invoke<{
    posApp?: PosApp;
    error?: string;
  }>('create-btcpay-pos-app', {
    method: 'POST',
    body: { merchantStoreId: input.merchantStoreId, appName },
  });

  if (error) {
    const serverError = await readFunctionError(error);
    // FunctionsFetchError wraps the original throw in `.context`; surface it so
    // a network/URL failure is diagnosable instead of a generic message.
    const context = (error as { context?: unknown }).context;
    const causeMessage =
      context instanceof Error
        ? context.message
        : typeof context === 'string'
          ? context
          : undefined;
    return { error: serverError ?? causeMessage ?? error.message };
  }
  if (data?.error) return { error: data.error };
  if (!data?.posApp) return { error: 'POS app was not returned by the server.' };
  return { posApp: data.posApp, error: null };
}

export interface UpdatePosAppInput {
  display_title: string;
  pos_style: string;
  currency: string;
  description: string | null;
}

/**
 * Persists editable POS app settings. Owner RLS allows this client update; it
 * does not push changes back to BTCPay yet (the app keeps serving the original
 * config there — that sync is future work).
 */
export async function updatePosApp(
  id: string,
  updates: UpdatePosAppInput,
): Promise<{ posApp?: PosApp; error: string | null }> {
  if (isDevAuthActive()) {
    const updated = updateDevPosApp(id, updates);
    return updated ? { posApp: updated, error: null } : { error: 'POS app not found.' };
  }

  const { data, error } = await supabase
    .from('merchant_pos_apps')
    .update(updates)
    .eq('id', id)
    .select('*')
    .single();

  if (error) return { error: error.message };
  return { posApp: data, error: null };
}
