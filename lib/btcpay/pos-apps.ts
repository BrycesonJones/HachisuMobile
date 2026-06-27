import { isDevAuthActive } from '@/lib/auth/dev-session';
import {
  addDevPosApp,
  getDevPosApp,
  getDevPosApps,
  removeDevPosApp,
  updateDevPosApp,
} from '@/lib/btcpay/dev-pos-apps';
import { supabase } from '@/lib/supabase';
import type { PosProduct } from '@/components/payments/pos/products/product-types';
import type { PosApp } from '@/types/pos-app';

export interface CreatePosAppInput {
  merchantStoreId: string;
  appName: string;
}

export interface CreatePosAppResult {
  posApp?: PosApp;
  error: string | null;
}

type InvokeOptions = Parameters<typeof supabase.functions.invoke>[1];

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

/** Builds a user-facing message from an invoke error, preferring the server's
 * `{ error }` then the underlying fetch cause then the generic message. */
async function describeInvokeError(error: { message: string }): Promise<string> {
  const serverError = await readFunctionError(error);
  const context = (error as { context?: unknown }).context;
  const causeMessage =
    context instanceof Error
      ? context.message
      : typeof context === 'string'
        ? context
        : undefined;
  return serverError ?? causeMessage ?? error.message;
}

/** A transient, network-level fetch failure (no HTTP response received). On the
 * iOS simulator these happen sporadically; a single retry clears them. */
function isTransientFetchError(error: unknown): boolean {
  return (
    !!error &&
    typeof error === 'object' &&
    (error as { name?: string }).name === 'FunctionsFetchError'
  );
}

/**
 * Invokes an Edge Function, retrying ONCE on a transient fetch failure. Only use
 * for idempotent operations — a retry could otherwise duplicate side effects.
 */
async function invokeIdempotent<T>(name: string, options: InvokeOptions) {
  let result = await supabase.functions.invoke<T>(name, options);
  if (result.error && isTransientFetchError(result.error)) {
    result = await supabase.functions.invoke<T>(name, options);
  }
  return result;
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
      products: [],
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

  // Create is NOT idempotent (a retry could create a second app), so it is not
  // wrapped in invokeIdempotent.
  if (error) return { error: await describeInvokeError(error) };
  if (data?.error) return { error: data.error };
  if (!data?.posApp) return { error: 'POS app was not returned by the server.' };
  return { posApp: data.posApp, error: null };
}

export interface UpdatePosAppInput {
  displayTitle: string;
  posStyle: string;
  currency: string;
  description: string | null;
  products: PosProduct[];
}

/**
 * Persists POS app settings + product menu via the update-btcpay-pos-app Edge
 * Function (which syncs to BTCPay and Supabase). Idempotent, so a transient
 * fetch failure is retried once.
 */
export async function updatePosApp(
  id: string,
  updates: UpdatePosAppInput,
): Promise<{ posApp?: PosApp; error: string | null }> {
  if (isDevAuthActive()) {
    const updated = updateDevPosApp(id, {
      display_title: updates.displayTitle,
      pos_style: updates.posStyle,
      currency: updates.currency,
      description: updates.description,
      products: updates.products as unknown as PosApp['products'],
    });
    return updated ? { posApp: updated, error: null } : { error: 'POS app not found.' };
  }

  const { data, error } = await invokeIdempotent<{ posApp?: PosApp; error?: string }>(
    'update-btcpay-pos-app',
    {
      method: 'POST',
      body: {
        posAppId: id,
        displayTitle: updates.displayTitle,
        posStyle: updates.posStyle,
        currency: updates.currency,
        description: updates.description,
        products: updates.products,
      },
    },
  );

  if (error) return { error: await describeInvokeError(error) };
  if (data?.error) return { error: data.error };
  if (!data?.posApp) return { error: 'POS app was not returned by the server.' };
  return { posApp: data.posApp, error: null };
}

/**
 * Deletes a POS app via the delete-btcpay-pos-app Edge Function, which removes
 * it from BTCPay and Supabase. Idempotent (BTCPay 404 = success, DB delete is a
 * no-op if gone), so a transient fetch failure is retried once. Dev-bypass mode
 * removes it from the in-memory registry.
 */
export async function deletePosApp(posAppId: string): Promise<{ error: string | null }> {
  if (isDevAuthActive()) {
    removeDevPosApp(posAppId);
    return { error: null };
  }

  const { data, error } = await invokeIdempotent<{ success?: boolean; error?: string }>(
    'delete-btcpay-pos-app',
    { method: 'POST', body: { posAppId } },
  );

  if (error) return { error: await describeInvokeError(error) };
  if (data?.error) return { error: data.error };
  return { error: null };
}
