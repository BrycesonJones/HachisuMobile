// Server-side product feature gates.
//
// A feature flag that lives only in the mobile bundle hides screens; it does not
// disable capability. The Edge Functions behind a hidden feature stay deployed,
// authenticated and fully functional, and anyone holding a session token can
// call them directly — the app is not the only client of this API.
//
// That matters for Lightning specifically. While the product gate is off the app
// shows no Lightning anywhere, but the Lightning backend can still:
//   * install/configure the Boltz plugin for a merchant's BTCPay store,
//   * import an L-BTC descriptor and select it as the store's Lightning receive
//     wallet, and
//   * enable the BTC-LN payment method on the store.
//
// The result would be a live payment rail — offered to paying customers at the
// public Pay Button, POS and checkout — that the merchant's own dashboard cannot
// show, cannot report on, and would not warn them about. Settlement would go to
// whatever Liquid descriptor was submitted. A stolen session could redirect
// receipts through a channel the victim has no UI for.
//
// So the gate is enforced where the capability is, not where the screen is.
//
// KEEP IN SYNC with constants/feature-flags.ts (the client gate). The two are
// checked against each other by `npm run check:design`.
export const LIGHTNING_ENABLED = false;

import { jsonResponse } from './cors.ts';
import { logFeatureDisabledAttempt } from './security-log.ts';

/**
 * The refusal every Lightning-MUTATING endpoint returns while the product gate
 * is off. Reads and teardown are deliberately not gated: a merchant who has
 * Lightning configured from an earlier build must still be able to see it and
 * turn it off. Only paths that CREATE or CHANGE Lightning capability are closed.
 */
export function lightningDisabledResponse(action: string): Response {
  // A09 (CWE-778): the refusal is RECORDED. This gate stands in front of a
  // capability that can redirect a merchant's receipts (see above), so repeated
  // attempts to reach it are exactly the signal an operator needs — and without
  // this they were invisible, because the gate returns before anything else in
  // the function runs. It fires BEFORE authentication (deliberately: a disabled
  // feature should not do lookup work), so there is no user id to record; the
  // platform's function_edge_logs carry the request id and source for the same
  // request, which is what correlates the two.
  logFeatureDisabledAttempt({ action, feature: 'lightning' });
  return jsonResponse(
    {
      ok: false,
      code: 'LIGHTNING_DISABLED',
      error: 'Lightning is not available yet.',
    },
    403,
  );
}
