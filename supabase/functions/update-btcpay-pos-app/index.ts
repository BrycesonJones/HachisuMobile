// Edge Function: update-btcpay-pos-app
//
// Persists POS app settings + product menu. Verifies the row belongs to the
// caller, pushes the config + product template to BTCPay (Greenfield PUT
// /apps/pos/{appId}), and saves config + products JSONB to Supabase.
//
// BTCPay sync is best-effort: if BTCPay rejects the update the products are
// still persisted to Supabase (the app's source of truth for the mobile UI) and
// a warning is returned. The Greenfield key stays server-side.

import { createClient } from 'jsr:@supabase/supabase-js@2.112.4';

import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import {
  BtcpayApiError,
  BtcpayConfigError,
  getBtcpayConfig,
  updatePosApp,
} from '../_shared/btcpay-client.ts';
import { buildTemplate, PosProductError } from '../_shared/pos-template.ts';

const MAX_TITLE_LENGTH = 100;

// Hachisu POS modes -> BTCPay defaultView + persisted pos_style. The client
// submits only a Hachisu-level mode ('products' | 'quick-charge'); raw BTCPay
// views (Static/Cart/Light/Print) are NEVER accepted from the client. 'products'
// is Cart (a one-item purchase is a one-item cart — Phase 1); 'quick-charge' is
// Light (the keypad). Saving a legacy 'product-list' (Static) products app still
// normalizes it to Cart here.
const MODE_CONFIG = {
  products: { defaultView: 'Cart', posStyle: 'product-list-cart' },
  'quick-charge': { defaultView: 'Light', posStyle: 'quick-charge' },
} as const;
type PosMode = keyof typeof MODE_CONFIG;

/** The app's current mode as stored. Unknown/legacy values read as 'products' —
 * never as quick-charge, which would silently change how the POS charges. */
function modeFromStyle(style: string): PosMode {
  return style === 'quick-charge' ? 'quick-charge' : 'products';
}

// The template serializer lives in ../_shared/pos-template.ts — it is shared
// with update-btcpay-pos-mode, which must resend the full template on a
// mode-only change because Greenfield's PUT is a full replace.

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
    posMode?: unknown;
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
    .select('id, user_id, btcpay_app_id, pos_style')
    .eq('id', posAppId)
    .maybeSingle<{ id: string; user_id: string; btcpay_app_id: string; pos_style: string }>();
  if (appError) {
    return jsonResponse({ error: 'Could not load the POS app.' }, 500);
  }
  if (!app || app.user_id !== user.id) {
    return jsonResponse({ error: 'POS app not found.' }, 404);
  }

  // Only the two Hachisu modes are accepted. An absent/unrecognized posMode
  // (e.g. an older client build) PRESERVES the app's current mode rather than
  // silently flipping a Quick Charge app back to Cart.
  const posMode: PosMode =
    body.posMode === 'products' || body.posMode === 'quick-charge'
      ? body.posMode
      : modeFromStyle(app.pos_style);
  const { defaultView, posStyle } = MODE_CONFIG[posMode];

  // Serialize the menu first: an invalid product rejects the whole save (400)
  // before anything is written to BTCPay or Supabase.
  let template: string;
  try {
    template = buildTemplate(products);
  } catch (err) {
    if (err instanceof PosProductError) {
      return jsonResponse({ error: err.message }, 400);
    }
    throw err;
  }

  // Push to BTCPay (best-effort — products still persist to Supabase on failure).
  let btcpayWarning: string | null = null;
  try {
    const config = getBtcpayConfig();
    // The template is pushed in BOTH modes so switching to Quick Charge never
    // discards the product catalog — BTCPay keeps items independent of the view.
    await updatePosApp(config, app.btcpay_app_id, {
      title: displayTitle,
      currency,
      defaultView,
      description: description ?? '',
      template,
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
