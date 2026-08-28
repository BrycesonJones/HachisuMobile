/**
 * Product-level feature gates.
 *
 * LIGHTNING_ENABLED gates every user-facing Lightning surface: the dashboard
 * wallet rows, invoice payment-method selection, the Pay Button LNURL tab, and
 * the Lightning setup/settings screens (which render a "Coming soon" placeholder
 * while gated, so deep links and stale routes can't reach the real flow).
 *
 * This is a UI/product gate only. The Lightning/Boltz backend — edge functions,
 * API clients (lib/btcpay/lightning*.ts), database fields, and payment-method
 * handling — stays fully intact behind it. Flip to true to re-enable Lightning
 * across the app.
 */
export const LIGHTNING_ENABLED = false;

/** User-facing label for gated Lightning surfaces. */
export const LIGHTNING_BETA_LABEL = 'Lightning · Beta';

/** Longer variant for surfaces where extra context helps. */
export const LIGHTNING_BETA_COMING_SOON_LABEL = 'Lightning · Beta — Coming soon';
