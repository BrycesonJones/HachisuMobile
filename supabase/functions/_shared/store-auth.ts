// Shared authenticated-store resolution for store-scoped BTCPay endpoints.
//
// Every invoice/activity/report request MUST resolve through this path:
//   1. Authenticate the caller (JWT -> getUser).
//   2. Verify the caller OWNS the merchant store row (service role, server-side).
//   3. Resolve btcpay_store_id from the owned row — a client-supplied BTCPay
//      store id is never accepted as authorization.
//
// A failure returns a ready-to-send Response so callers cannot accidentally
// continue with a half-resolved context.

import { createClient } from 'jsr:@supabase/supabase-js@2';

import { jsonResponse } from './cors.ts';

export interface OwnedStoreContext {
  userId: string;
  merchantStoreId: string;
  btcpayStoreId: string;
  storeName: string;
}

export type ResolveOwnedStoreResult =
  | { ok: true; ctx: OwnedStoreContext }
  | { ok: false; response: Response };

/**
 * Resolves and authorizes the (authenticated user, merchant store) pair.
 * `merchantStoreId` is the caller-supplied Hachisu store id; ownership and the
 * BTCPay mapping are decided exclusively by the server-side row.
 */
export async function resolveOwnedStore(
  req: Request,
  merchantStoreId: unknown,
): Promise<ResolveOwnedStoreResult> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return { ok: false, response: jsonResponse({ ok: false, error: 'Server is not configured.' }, 500) };
  }

  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) {
    return {
      ok: false,
      response: jsonResponse(
        { ok: false, error: 'Missing or invalid Authorization header.' },
        401,
      ),
    };
  }
  const userScoped = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const {
    data: { user },
    error: userError,
  } = await userScoped.auth.getUser();
  if (userError || !user) {
    return { ok: false, response: jsonResponse({ ok: false, error: 'Not authenticated.' }, 401) };
  }

  const storeId = typeof merchantStoreId === 'string' ? merchantStoreId.trim() : '';
  if (!storeId) {
    return {
      ok: false,
      response: jsonResponse({ ok: false, error: 'merchantStoreId is required.' }, 400),
    };
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });
  const { data: store, error: storeError } = await admin
    .from('merchant_stores')
    .select('id, user_id, btcpay_store_id, name')
    .eq('id', storeId)
    .maybeSingle<{ id: string; user_id: string; btcpay_store_id: string | null; name: string }>();
  if (storeError) {
    return { ok: false, response: jsonResponse({ ok: false, error: 'Could not load the store.' }, 500) };
  }
  // Not-found and not-owned are indistinguishable to the caller by design.
  if (!store || store.user_id !== user.id) {
    return { ok: false, response: jsonResponse({ ok: false, error: 'Store not found.' }, 404) };
  }
  if (!store.btcpay_store_id) {
    return {
      ok: false,
      response: jsonResponse(
        { ok: false, error: 'This store is not connected to BTCPay yet.' },
        409,
      ),
    };
  }

  return {
    ok: true,
    ctx: {
      userId: user.id,
      merchantStoreId: store.id,
      btcpayStoreId: store.btcpay_store_id,
      storeName: store.name,
    },
  };
}
