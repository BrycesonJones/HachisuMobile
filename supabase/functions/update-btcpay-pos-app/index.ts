// Edge Function: update-btcpay-pos-app
//
// Persists POS app settings + product menu. Verifies the row belongs to the
// caller, pushes the config + product template to BTCPay (Greenfield PUT
// /apps/pos/{appId}), and saves config + products JSONB to Supabase.
//
// BTCPay sync is best-effort: if BTCPay rejects the update the products are
// still persisted to Supabase (the app's source of truth for the mobile UI) and
// a warning is returned. The Greenfield key stays server-side.

import { createClient } from 'jsr:@supabase/supabase-js@2';

import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import {
  BtcpayApiError,
  BtcpayConfigError,
  getBtcpayConfig,
  updatePosApp,
  type PosDefaultView,
} from '../_shared/btcpay-client.ts';

const MAX_TITLE_LENGTH = 100;
const MAX_PRODUCTS = 250;

const POS_STYLE_TO_VIEW: Record<string, PosDefaultView> = {
  'product-list': 'Static',
  'product-list-cart': 'Cart',
};

// Mobile price types -> BTCPay item priceType. 'free' is a Fixed price of 0;
// 'any' maps to BTCPay's Topup (customer-entered amount).
const PRICE_TYPE_TO_BTCPAY: Record<string, string> = {
  fixed: 'Fixed',
  minimum: 'Minimum',
  any: 'Topup',
  free: 'Fixed',
};

/** Serialize the product menu into BTCPay's POS app template (JSON string). */
function buildTemplate(products: unknown[]): string {
  const items = products
    .slice(0, MAX_PRODUCTS)
    .map((p) => {
      const prod = (p ?? {}) as Record<string, unknown>;
      const priceType = typeof prod.priceType === 'string' ? prod.priceType : 'fixed';
      const needsPrice = priceType === 'fixed' || priceType === 'minimum';
      const priceNum = needsPrice ? Number(prod.price) : 0;
      const item: Record<string, unknown> = {
        id: String(prod.productId ?? ''),
        title: String(prod.name ?? ''),
        price: Number.isFinite(priceNum) ? priceNum : 0,
        priceType: PRICE_TYPE_TO_BTCPAY[priceType] ?? 'Fixed',
        disabled: prod.enabled === false,
      };
      if (typeof prod.description === 'string' && prod.description.trim()) {
        item.description = prod.description.trim();
      }
      if (typeof prod.category === 'string' && prod.category.trim()) {
        item.categories = [prod.category.trim()];
      }
      const inv = typeof prod.inventory === 'string' ? prod.inventory.trim() : '';
      if (inv && /^\d+$/.test(inv)) item.inventory = Number(inv);
      return item;
    })
    .filter((it) => it.id && it.title);

  return JSON.stringify(items);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return jsonResponse({ error: 'Server is not configured.' }, 500);
  }

  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) {
    return jsonResponse({ error: 'Missing or invalid Authorization header.' }, 401);
  }
  const userScoped = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const {
    data: { user },
    error: userError,
  } = await userScoped.auth.getUser();
  if (userError || !user) {
    return jsonResponse({ error: 'Not authenticated.' }, 401);
  }

  let body: {
    posAppId?: unknown;
    displayTitle?: unknown;
    posStyle?: unknown;
    currency?: unknown;
    description?: unknown;
    products?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body.' }, 400);
  }

  const posAppId = typeof body.posAppId === 'string' ? body.posAppId.trim() : '';
  if (!posAppId) {
    return jsonResponse({ error: 'A POS app id is required.' }, 400);
  }

  const displayTitle =
    typeof body.displayTitle === 'string' ? body.displayTitle.trim() : '';
  if (!displayTitle) {
    return jsonResponse({ error: 'A display title is required.' }, 400);
  }
  if (displayTitle.length > MAX_TITLE_LENGTH) {
    return jsonResponse(
      { error: `Display title must be ${MAX_TITLE_LENGTH} characters or fewer.` },
      400,
    );
  }

  const posStyle =
    typeof body.posStyle === 'string' && body.posStyle in POS_STYLE_TO_VIEW
      ? body.posStyle
      : 'product-list';
  const currency =
    typeof body.currency === 'string' && body.currency.trim()
      ? body.currency.trim().toUpperCase()
      : 'USD';
  const description =
    typeof body.description === 'string' && body.description.trim()
      ? body.description.trim()
      : null;
  const products = Array.isArray(body.products) ? body.products : [];

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  // Verify ownership.
  const { data: app, error: appError } = await admin
    .from('merchant_pos_apps')
    .select('id, user_id, btcpay_app_id')
    .eq('id', posAppId)
    .maybeSingle<{ id: string; user_id: string; btcpay_app_id: string }>();
  if (appError) {
    return jsonResponse({ error: 'Could not load the POS app.' }, 500);
  }
  if (!app || app.user_id !== user.id) {
    return jsonResponse({ error: 'POS app not found.' }, 404);
  }

  // Push to BTCPay (best-effort — products still persist to Supabase on failure).
  let btcpayWarning: string | null = null;
  try {
    const config = getBtcpayConfig();
    await updatePosApp(config, app.btcpay_app_id, {
      title: displayTitle,
      currency,
      defaultView: POS_STYLE_TO_VIEW[posStyle],
      description: description ?? '',
      template: buildTemplate(products),
    });
  } catch (err) {
    if (err instanceof BtcpayApiError) {
      btcpayWarning = err.message;
      console.error('[update-pos-app] BTCPay error', err.status, JSON.stringify(err.body));
    } else if (err instanceof BtcpayConfigError) {
      btcpayWarning = err.message;
    } else {
      btcpayWarning = 'Could not sync with BTCPay.';
      console.error('[update-pos-app] BTCPay sync failed:', String(err));
    }
  }

  // Persist to Supabase (source of truth for the mobile UI).
  const { data: updated, error: updateError } = await admin
    .from('merchant_pos_apps')
    .update({
      display_title: displayTitle,
      pos_style: posStyle,
      currency,
      description,
      products,
    })
    .eq('id', app.id)
    .select('*')
    .single();

  if (updateError || !updated) {
    console.error('[update-pos-app] DB update failed:', updateError?.message, app.id);
    return jsonResponse({ error: 'Could not save the POS app.' }, 500);
  }

  return jsonResponse({ posApp: updated, btcpayWarning });
});
