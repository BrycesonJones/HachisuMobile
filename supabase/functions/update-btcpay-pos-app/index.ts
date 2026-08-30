// Edge Function: update-btcpay-pos-app
//
// Persists POS app settings + product menu. Verifies the row belongs to the
// caller, pushes the config + product template to BTCPay (Greenfield PUT
// /apps/pos/{appId}), and saves config + products JSONB to Supabase.
//
// The BTCPay push happens FIRST and the save fails closed on it (OWASP A10:2025
// — CWE-390/CWE-636). Two systems hold this menu and they are not
// interchangeable: merchant_pos_apps renders the MERCHANT's screen, while the
// POS the customer actually taps is served by BTCPay from BTCPay's own
// template. Persisting a menu BTCPay refused would show the merchant a price
// that is not the price being charged, so nothing is written that BTCPay did
// not accept. update-btcpay-pos-mode holds the same contract.
// The Greenfield key stays server-side.

import { createClient } from 'jsr:@supabase/supabase-js@2.112.4';

import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import {
  BtcpayApiError,
  BtcpayConfigError,
  getBtcpayConfig,
  updatePosApp,
} from '../_shared/btcpay-client.ts';
import {
  MAX_DESCRIPTION_LENGTH,
  validateCurrency,
  validateOptionalText,
} from '../_shared/invoice-input.ts';
import { buildTemplate, PosProductError } from '../_shared/pos-template.ts';
import { logAuthorizationDenied } from '../_shared/security-log.ts';
import { readJsonObjectBody } from '../_shared/request-body.ts';

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

  const body:
    | {
        posAppId?: unknown;
        displayTitle?: unknown;
        posMode?: unknown;
        currency?: unknown;
        description?: unknown;
        products?: unknown;
      }
    | null = await readJsonObjectBody(req);
  if (!body) {
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

  // Currency and description are re-validated against the SAME shared rules the
  // invoice path uses. Both are forwarded to BTCPay's POS app update and
  // persisted to merchant_pos_apps, so neither may be an arbitrary unbounded
  // string just because the picker in the app only offers valid codes — the
  // client is untrusted. An absent currency keeps the previous 'USD' default.
  const currencyResult = validateCurrency(body.currency, 'USD');
  if (!currencyResult.ok) {
    return jsonResponse({ error: currencyResult.message }, 400);
  }
  const currency = currencyResult.value;

  const descriptionResult = validateOptionalText(
    body.description,
    MAX_DESCRIPTION_LENGTH,
    'Description',
  );
  if (!descriptionResult.ok) {
    return jsonResponse({ error: descriptionResult.message }, 400);
  }
  const description = descriptionResult.value;

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
    logAuthorizationDenied({
      action: 'update-btcpay-pos-app',
      userId: user.id,
      resourceType: 'pos_app',
      resourceId: posAppId,
      reason: app ? 'not_owner' : 'not_found',
    });
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

  // Push to BTCPay FIRST. A failure here ends the request: the merchant's menu
  // and the menu customers are charged from must not diverge, and BTCPay is the
  // one that charges. Nothing has been written to Supabase at this point, so the
  // saved menu is exactly the one that was already live.
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
      // A09 (CWE-532): status only — the body echoes the submitted template.
      console.error(`[update-pos-app] app=${app.id} btcpayStatus=${err.status}`);
    } else if (err instanceof BtcpayConfigError) {
      // getBtcpayConfig() already recorded which variable is wrong.
      console.error(`[update-pos-app] app=${app.id} BTCPay is not configured`);
    } else {
      console.error(`[update-pos-app] app=${app.id} BTCPay sync failed:`, String(err));
    }
    // A10 (CWE-209): the caller is told the save did not happen, never why
    // BTCPay said no — the status and body are the operator's.
    return jsonResponse(
      {
        code: 'BTCPAY_SYNC_FAILED',
        error:
          'Could not save these changes to the payment server, so nothing was changed. ' +
          'Your Point of Sale is still using its previous settings. Please try again.',
      },
      502,
    );
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

  return jsonResponse({ posApp: updated });
});
