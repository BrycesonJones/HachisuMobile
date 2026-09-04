# Hachisu Privacy Notice

**Effective date:** August 1, 2026

> **Draft for attorney review.** This document is a working draft prepared from the current
> Hachisu application behavior. It has not been reviewed by licensed counsel and must not be
> published or relied upon until it has been.

## 1. Who We Are

Hachisu is a mobile application ("Hachisu," "we," "us," or "our") that helps merchants
accept Bitcoin payments using their own Bitcoin wallets and payment infrastructure. You
can contact us through the Contact form at https://hachisu.io/#contact.

## 2. Scope of This Notice

This Privacy Notice describes how we collect, use, share, and retain information when you
use the Hachisu mobile application and the backend services that power it (together, the
"Service"). It applies to merchants and other individuals who create Hachisu accounts.

If you are a **customer of a Hachisu merchant** (for example, you paid a Bitcoin invoice at
a store that uses Hachisu), the merchant — not Hachisu — decides what information about you
to enter into the Service. Hachisu processes that information to provide the Service to the
merchant. Questions about a merchant's practices should be directed to that merchant.

## 3. Hachisu Is Non-Custodial

Hachisu is designed so that we never hold your money or your keys:

- We do **not** collect, store, or have access to private keys, seed phrases, or recovery
  phrases.
- We do **not** custody, hold, or control Bitcoin on your behalf. Bitcoin paid to you goes
  to wallets you control.
- When you connect a Bitcoin wallet, you provide only **public** wallet information — an
  extended public key ("xpub") or output descriptor — which can be used to generate
  receiving addresses and view related activity, but cannot be used to spend your Bitcoin.

## 4. Information We Collect

### 4.1 Account and authentication information

- **Email address.** Used to create and sign in to your account. We use one-time email
  passcodes instead of passwords, so we do not collect or store a password.
- **Session information.** Authentication tokens are stored locally on your device to keep
  you signed in.

### 4.2 Profile information

Depending on your account type, you may provide:

- **Personal profiles:** name, phone number, country, mailing address, and a username.
- **Business profiles:** business name, business address, business website (optional),
  business country, a description of the business, expected monthly payment volume, and a
  username.

We do not collect Social Security numbers, dates of birth, EINs, or government ID documents.

### 4.3 Merchant store and payment configuration

- Store names, display names, default currency, and preferred exchange-rate source.
- Identifiers linking your Hachisu store to the payment-processing infrastructure
  (BTCPay Server) that Hachisu provisions for it.
- Point-of-sale (POS) app configuration, including product names, prices, and settings you
  define.
- Pay Button configuration.

### 4.4 Wallet-related public information

- **Extended public keys / output descriptors.** When you connect a Bitcoin wallet, the
  public wallet information you provide is transmitted through our backend to the BTCPay
  Server payment infrastructure so it can generate receiving addresses for your store. We
  do **not** persist the extended public key or descriptor itself in our application
  database. We store only:
  - a one-way cryptographic fingerprint (a SHA-256 hash) of the wallet scheme, used to
    detect whether a later wallet change refers to the same wallet;
  - non-sensitive metadata such as the address type (for example, native SegWit) and the
    date the wallet was connected.
- **Receiving addresses** derived from your public wallet information may be shown to you
  in the app (for example, so you can confirm the wallet is the one you expect).

### 4.5 Invoice, payment request, and transaction information

- **Invoices:** amount, currency, description, order ID, an optional customer email
  address you enter, and the invoice's checkout link and status.
- **Payment requests:** amount, currency, title, memo, reference ID, an optional recipient
  email address you enter, and related settings and links.
- **Payment activity:** information about payments to your store retrieved from your
  store's payment infrastructure, such as invoice identifiers, amounts, payment method
  (for example, on-chain Bitcoin), Bitcoin addresses, transaction identifiers, statuses,
  and timestamps.
- **Balances and exchange rates:** your store's on-chain wallet balance and exchange-rate
  information used to display approximate fiat values.

If you enter information about your customers (such as a customer email address on an
invoice), you are responsible for having the right to provide it to us.

### 4.6 Technical and log information

The Hachisu app does not include analytics, advertising, or tracking software development
kits. However, like essentially all internet services:

- Our infrastructure providers (described in Section 7) automatically generate server-side
  logs when your device communicates with our backend. These logs may include information
  such as IP address, request timestamps, and request metadata, and are used for security,
  debugging, and operating the Service.
- Certain preferences (such as in-app notification preferences and your selected store)
  are stored locally on your device and are not transmitted to us.

### 4.7 Communications and support

If you contact us (for example, through our Contact form), we collect the information
you choose to send, such as your email address and the contents of your message.

## 5. How We Collect Information

- **Directly from you** — when you create an account, complete onboarding, edit your
  profile, create stores, connect wallets, and create invoices, payment requests, or POS
  apps.
- **From your use of the Service** — payment activity and balances retrieved from the
  payment infrastructure associated with your stores.
- **Automatically, at the infrastructure level** — server logs generated by our service
  providers, as described above.

## 6. How We Use Information

We use the information described above to:

- create and manage your account and verify sign-ins;
- provision and manage your merchant stores and their payment-processing infrastructure;
- connect and manage your Bitcoin wallet configuration using the public wallet information
  you provide;
- create and manage invoices, payment requests, POS apps, and Pay Buttons;
- display your payment activity, balances, and reports, including CSV exports you request;
- respond to support requests;
- secure the Service, prevent abuse, and debug problems; and
- comply with applicable law.

We do **not** use your information for targeted advertising, and we do **not** sell your
personal information.

## 7. How We Share Information

We share information only as needed to run the Service:

- **Supabase** — our backend platform. Supabase hosts our database, authentication (including
  delivery of one-time sign-in codes to your email), and server-side functions. Your account,
  profile, store, invoice, and payment-request records are stored on Supabase infrastructure.
- **BTCPay Server payment infrastructure** — the payment-processing system your Hachisu
  store runs on. It receives your store configuration, your public wallet information
  (xpub/descriptor), invoice and payment-request details, and POS configuration, and it
  generates the checkout pages your customers use. [NOTE FOR REVIEW: describe whether this
  BTCPay Server deployment is operated by Hachisu or by a third-party host, and name the
  hosting provider if third-party.]
- **Exchange-rate sources** — the payment infrastructure retrieves Bitcoin exchange rates
  from public rate providers (for example, Kraken) to price invoices and display fiat
  values. Your personal information is not sent to rate providers.
- **Apple and Google (app platforms)** — the app is distributed through mobile app
  platforms, which have their own privacy practices governing app downloads and your
  device.
- **Professional advisers, authorities, and successors** — we may share information when
  required by law, to protect our rights or users' safety, with professional advisers, or
  in connection with a merger, acquisition, or sale of assets (in which case this Notice
  will continue to apply to previously collected information until updated).

We do not sell personal information, and we do not share it with data brokers or
advertising networks.

## 8. Bitcoin and Public Blockchains

Bitcoin transactions are recorded on the public Bitcoin blockchain. This means:

- Transaction details — including addresses, amounts, and transaction identifiers — are
  **publicly visible to anyone** and are replicated across the Bitcoin network worldwide.
- Blockchain records are designed to be permanent. **Hachisu cannot modify, delete, or
  conceal information recorded on the Bitcoin blockchain**, including after you delete
  your Hachisu account.
- Bitcoin addresses are pseudonymous, but they can sometimes be linked to identities
  through outside information. Be thoughtful about what you associate with your addresses.

## 9. Data Retention

We keep your account and related records while your account is active. Specifically:

- Application records (profile, stores, invoices, payment requests, POS configuration,
  activity metadata) are retained until you delete your account.
- Infrastructure-level logs and database backups maintained by our service providers are
  retained for limited periods according to those providers' practices.
- We may retain limited records where reasonably necessary to comply with law, resolve
  disputes, enforce agreements, or protect the security of the Service.

## 10. Account Deletion

You can permanently delete your Hachisu account from within the app (Account → Close
Account). When you delete your account:

- **Deleted:** your account and application data — your authentication account, profile,
  merchant store records, POS app records, invoice and payment-request records, legal
  consent records, and related operational records — are permanently deleted. The
  payment-processing (BTCPay Server) stores that Hachisu provisioned for your account
  are also permanently deleted, including their apps and wallet configuration, and no
  new invoices or checkout pages can be created for them. If this payment-infrastructure
  cleanup cannot be completed, account deletion stops with an error so no records are
  left behind without an owner — you can retry.
- **May persist temporarily:** copies in service-provider backups and server logs, which
  expire on those providers' schedules. The payment infrastructure also retains
  historical invoice records, so a previously issued invoice or checkout page may remain
  viewable after your account is deleted; an invoice still within its validity window at
  deletion remains payable — to your own wallet — until it expires.
- **Cannot be deleted:** Bitcoin blockchain records, and any Bitcoin in your own wallets
  (which we never held in the first place — deleting your account does not affect your
  Bitcoin, but make sure you retain your own wallet backups and any exported reports you
  need before deleting).

## 11. Security

We take reasonable measures designed to protect your information, including:

- database access rules that restrict each account's records to that account;
- keeping payment-infrastructure API credentials on the server side only — they are never
  sent to or stored on your device;
- never collecting private keys or seed phrases at all, which keeps the most sensitive
  wallet material entirely out of our systems; and
- transmitting data between the app and our backend over encrypted (HTTPS) connections.

No system is perfectly secure, and we cannot guarantee absolute security.

## 12. Your Choices

- **Profile information.** You can view and edit your profile and business information in
  the app.
- **Optional fields.** Some fields (such as a customer email on an invoice) are optional —
  you decide whether to provide them.
- **Sign-in.** We sign you in with your email address and a one-time code. We do not use
  passwords or third-party sign-in services.
- **In-app notification preferences.** Stored only on your device.
- **Account deletion.** Available in the app, as described in Section 10.

The Hachisu app does not use advertising identifiers or cross-app tracking, so there is no
advertising opt-out to manage.

## 13. U.S. State Privacy Rights

Depending on where you live, state privacy laws may give you rights over personal
information, such as the right to access, correct, or delete it. Many of these laws apply
only to businesses above certain size or revenue thresholds, and some exclude
business-contact and business-to-business data; whether and how they apply to Hachisu has
not yet been determined. [NOTE FOR REVIEW: counsel to assess state privacy-law
applicability and finalize this section.]

Regardless of legal thresholds, you can always access and edit your profile in the app,
delete your account as described above, or contact us through
the Contact form at https://hachisu.io/#contact with privacy questions or requests. We do not sell personal information or use it for targeted
advertising, so no "do not sell or share" opt-out is required to achieve that result.

## 14. Children's Privacy

The Service is intended for business use by adults. It is not directed to children, and we
do not knowingly collect personal information from anyone under 18. If you believe a child
has provided us personal information, contact us through the Contact form at https://hachisu.io/#contact
and we will delete it.

## 15. International Users

The Service is operated from the United States and is intended for U.S.-based use during
this stage of the product. If you use the Service from outside the United States, your
information will be transferred to and processed in the United States (and in the regions
where our service providers host data), where privacy laws may differ from those of your
jurisdiction.

## 16. Changes to This Notice

We may update this Privacy Notice from time to time. If we make material changes, we will
notify you through the app or by email and update the effective date above. Your continued
use of the Service after an updated Notice takes effect means the updated Notice applies.

## 17. Contact Us

Questions or requests about this Privacy Notice or your information: contact us through
the Contact form at https://hachisu.io/#contact.
