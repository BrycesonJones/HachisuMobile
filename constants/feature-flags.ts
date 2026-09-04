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

/**
 * Gates the Google sign-in surface: the "Continue with Google" entry points on
 * the personal and business sign-up screens, and the OAuth call itself
 * (lib/auth/auth-service.ts returns early while this is false, so the disabled
 * state cannot be bypassed by a caller that skips the UI).
 *
 * Hachisu's iOS MVP ships its own email/OTP account setup and sign-in system
 * exclusively. That is a deliberate product decision for this release: offering
 * a third-party login service to establish the user's primary account brings
 * the App Store's login-service requirements into scope, which oblige the app
 * to also offer an equivalent login service that limits collection to name and
 * email AND lets users keep their email address private. Hachisu's first-party
 * email/OTP cannot provide the private-email property — the address is both the
 * identifier and the delivery channel — so satisfying those requirements would
 * mean adding a further provider. At the time of this decision no production
 * account had ever been created through Google, so gating the surface removed
 * that obligation at no cost to any user.
 *
 * This is a UI/product gate, not a teardown. The OAuth machinery behind it
 * stays intact and tested: PKCE is still pinned (supabase-auth-options.ts,
 * enforced by check:config) and the callback interpreter that refuses
 * implicit-flow tokens is still covered by lib/auth/oauth-callback.test.ts.
 *
 * Revisit alongside an equivalent-login strategy — adding Sign in with Apple,
 * or shipping a surface the App Store login-service rules do not govern (an
 * Android or web build) — rather than by flipping this flag on its own.
 * lib/auth/google-auth-gate.test.ts holds the invariant.
 */
export const GOOGLE_AUTH_ENABLED = false;

/** User-facing label for gated Lightning surfaces. */
export const LIGHTNING_BETA_LABEL = 'Lightning · Beta';

/** Longer variant for surfaces where extra context helps. */
export const LIGHTNING_BETA_COMING_SOON_LABEL = 'Lightning · Beta — Coming soon';
