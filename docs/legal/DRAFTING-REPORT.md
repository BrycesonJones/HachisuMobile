# Legal Drafts — Research & Drafting Report

Prepared 2026-08-28 alongside the first drafts of `privacy-notice.md`, `e-sign-consent.md`,
and `terms-of-service.md`. This report documents what was verified in the repository, what
was assumed, and what must go to licensed counsel. **None of these documents is legal
advice, and none should ship without attorney review.**

## 1. Repository findings relied upon

**Authentication** (`lib/auth/auth-service.ts`, `lib/supabase.ts`)
- Passwordless email OTP via Supabase Auth (`signInWithOtp` / `verifyOtp`); login cannot
  create accounts (`shouldCreateUser: false`). No passwords collected.
- Google OAuth via Supabase (`signInWithOAuth` + expo-web-browser auth session). Code is
  shipped; Supabase provider configuration was still pending as of 2026-08-28.
- Session tokens persisted on-device in AsyncStorage.
- No SMS/phone verification backend exists (no SMS calls anywhere in `lib/auth`); the
  personal-flow phone-confirmation screens are UI-only.

**Profiles** (`supabase/migrations/20260524043719`, `20260528195424`; account screens)
- `user_profiles`: email, username, account_type (personal/business), full_name, phone,
  country, personal_address, business_name/address/website/country/description,
  expected_monthly_volume, display_name, BTCPay identifiers, status fields.
- Migration comment explicitly states SSN, DOB, and EIN are intentionally NOT stored;
  identity/business verification screens are placeholders.

**Stores & BTCPay** (`20260609200354`, `20260611124441`, `supabase/functions/_shared/btcpay-client.ts`)
- Each Hachisu store maps to a BTCPay Server store, provisioned server-side via edge
  functions. The Greenfield API key lives only in edge-function env
  (`BTCPAY_GREENFIELD_API_KEY`); never sent to the client or stored in the DB.
- One shared BTCPay server (`BTCPAY_SERVER_URL` env); its hostname is deliberately not
  embedded in the mobile bundle.

**Wallet connection** (`20260617120000`, `20260729120000`)
- Merchant supplies xpub/descriptor; it is transmitted through edge functions to
  BTCPay/NBXplorer and NOT persisted in Supabase. Stored: SHA-256 scheme fingerprint,
  address type, connect timestamp, statuses. Migration comments state "We NEVER persist
  key material."
- Staged replacement flow: preview tokens, op locks, idempotency records (all cascade on
  user delete).

**Invoices / payment requests** (`20260821120000`, `20260824120000`)
- `merchant_invoices`: amount, currency, description, order_id, optional **buyer_email**
  (merchant-entered customer data), checkout_link, statuses.
- `merchant_payment_requests`: amount, currency, title, memo, reference_id, optional
  **recipient_email**, request_url, allow_custom_amounts, form_id.

**POS / Pay Button** (`20260627150000`, pay-button edge fns)
- POS apps live in BTCPay (BTCPay-hosted runtime pages); Supabase stores config metadata
  (names, products, prices in jsonb). Pay Button generates public BTCPay checkout
  links/embeds; store-level anyoneCanCreateInvoice.

**Activity / balances / reports**
- Activity and balances fetched live from BTCPay via edge functions (BTCPay is the
  authoritative record). CSV export: server generates rows, client writes a local file
  (expo-file-system) and hands it to the OS share sheet (expo-sharing) — Hachisu never
  emails or uploads exports. Account statements are monthly slices of the same CSV.

**Account deletion** (`supabase/functions/delete-account/index.ts`)
- JWT-derived target only; Supabase Admin hard delete; ALL app tables cascade from
  auth.users (user_profiles, merchant_stores, merchant_pos_apps, merchant_invoices,
  merchant_payment_requests, user_legal_acceptances, user_address_balances,
  provisioning events, replacement previews/ops). Read-back verification before
  reporting success.
- UPDATED 2026-08-28: the user's BTCPay stores are now permanently deleted (Greenfield
  DELETE /api/v1/stores/{id}) BEFORE the Supabase account is removed; any BTCPay
  cleanup failure aborts the whole deletion so orphaned infrastructure cannot be
  created. The legal drafts reflect this.

**Telemetry / tracking / permissions** (`package.json`, `app.json`)
- No analytics, crash-reporting, advertising, tracking, or push-notification SDKs. No
  Sentry/Firebase/Amplitude/expo-notifications. No camera/location/contacts/notification
  permission plugins in `app.json`.
- Notification "preferences" are AsyncStorage-only UI state (`hooks/use-notification-preferences.ts`);
  the onboarding push screen is a placeholder with a TODO.
- Lightning is fully gated off (`constants/feature-flags.ts` LIGHTNING_ENABLED=false);
  documents therefore describe on-chain Bitcoin only.

## 2. Third-party services identified

| Service | Why used | Data processed | Verified in |
|---|---|---|---|
| **Supabase** | Auth (email OTP delivery, Google OAuth broker), Postgres DB, edge functions | Email, profile/business data, store/invoice/payment-request records, server logs (IP, request metadata) | `lib/supabase.ts`, `lib/auth/auth-service.ts`, `supabase/` |
| **BTCPay Server** (Hachisu-provisioned instance) | Store provisioning, invoices, checkout pages, POS runtime, wallet balance/activity, rates | Store config, xpub/descriptor, invoice & payment-request details (incl. buyer emails), POS products, payment/tx data | `supabase/functions/*`, `_shared/btcpay-client.ts` |
| **Google (OAuth)** | Optional sign-in | Google account email/basic profile via Supabase OAuth | `signInWithGoogleOAuth` in `lib/auth/auth-service.ts` |
| **Exchange-rate sources (e.g. Kraken)** | BTCPay fetches BTC/fiat rates (store `preferred_price_source` default 'kraken') | No user personal data | `20260611124441` migration, balance edge fns |
| **Expo / EAS** | App framework & build infrastructure (EAS projectId in app.json) | Build-time only; no runtime analytics found | `app.json`, `package.json` |
| **Apple / Google app platforms** | Distribution | Platform-governed install data | Standard mobile distribution |

Not found (and therefore not named in the documents): email marketing providers, SMS
providers, push services, analytics, ad networks, crash reporting, payment processors
other than BTCPay.

## 3. Privacy assumptions / open questions

1. **Who operates the BTCPay Server deployment** (Hachisu itself vs. a third-party host,
   and the underlying hosting provider) could not be determined from the repo — the URL is
   server-side env. The Privacy Notice flags this with a review note.
2. **Supabase auth email delivery** — assumed Supabase's built-in email (no custom SMTP
   config in repo). If a custom SMTP provider is configured in the Supabase dashboard, add
   it as a subprocessor.
3. **Backup/log retention periods** at Supabase/BTCPay hosting are provider-controlled;
   documents use "limited periods" language rather than specific durations.
4. **Email change flow** — no self-service email-change UI exists; E-Sign Consent says to
   contact support and flags this for confirmation.
5. **Hosting region** — assumed U.S.-based operation per product direction; not verifiable
   from the repo.

## 4. Attorney-review items (must be resolved before launch)

- **Legal entity / operator identity** and all bracketed placeholders.
- **State privacy-law applicability** (CCPA/CPRA thresholds, B2B data treatment,
  other state laws) — Privacy Notice §13 is deliberately cautious.
- **Money-transmission / regulatory characterization** — ToS §2 asserts non-custodial,
  no-money-transmission posture; counsel must confirm, especially given Hachisu provisions
  the BTCPay infrastructure that generates invoices (funds flow directly to merchant
  wallets, but the characterization needs legal sign-off). FinCEN/state MTL analysis.
- **Sanctions/export language** (ToS §13).
- **Limitation of liability** (ToS §21) including the US$100 cap.
- **Indemnification** (ToS §22).
- **Governing law** (ToS §23).
- **Arbitration / class-action waiver** — intentionally left as a placeholder, not drafted.
- **E-SIGN mechanics** — whether the demonstrable-consent flow (checkbox/screen) satisfies
  E-SIGN §101(c) for any records legally required to be in writing; withdrawal = account
  closure consequence (E-Sign Consent §7).
- ~~BTCPay-side data retention after account deletion~~ — RESOLVED 2026-08-28: stores
  (with their invoices, apps, and wallet configuration) are deleted during account
  deletion; the Privacy Notice §10 and ToS §18 now say so.
- **Warranty disclaimers** (ToS §19) vs. state consumer-protection limits.

## 5. Product/legal mismatches found

1. ~~Phone "verification" UI without a backend~~ — RESOLVED 2026-08-28: the fake
   confirmation screen was removed; phone number is now collected as plain profile
   information with honest copy.
2. ~~Push-notification onboarding screen with no push infrastructure~~ — RESOLVED
   2026-08-28: the onboarding step was removed; the App Notifications settings page now
   states that delivery is not live yet.
3. ~~Account deletion leaves BTCPay records orphaned~~ — RESOLVED 2026-08-28: BTCPay
   stores are permanently deleted (cleanup-first, fail-safe) during account deletion.
4. **Legacy schema remnants:** `user_address_balances` table and `user_profiles.wallet_address`
   column exist in the DB but are unreferenced by app code. They cascade on delete, so no
   deletion-promise conflict, but consider dropping them.
5. **Google sign-in code shipped but provider config pending** — if launched without
   enabling it, the Privacy Notice's Google references become forward-looking (harmless,
   marked "optional/where available" in ToS).
6. ~~No consent-capture flow exists yet~~ — RESOLVED 2026-08-28: versioned server-side
   consent capture (`user_legal_acceptances`, trigger-enforced timestamps, RLS) is
   recorded during onboarding and via a legal gate for pre-existing users; the in-app
   Legal documents screen now renders all three documents from the Markdown source
   (attorney annotations stripped at generation time).
