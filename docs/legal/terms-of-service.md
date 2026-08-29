# Hachisu Terms of Service

**Effective date:** [EFFECTIVE DATE]

> **Draft for attorney review.** This document is a working draft prepared from the current
> Hachisu application behavior. It has not been reviewed by licensed counsel and must not be
> published or relied upon until it has been.

These Terms of Service ("Terms") are an agreement between you and [LEGAL ENTITY NAME]
("Hachisu," "we," "us," or "our") governing your use of the Hachisu mobile application and
the backend services that power it (together, the "Service").

## 1. Acceptance of These Terms

By creating an account, tapping "I agree" (or a similar control), or using the Service,
you accept these Terms, our Privacy Notice, and our Electronic Communications and E-Sign
Consent. If you do not agree, do not use the Service.

## 2. What Hachisu Is (and Is Not)

Hachisu is **software** that helps merchants accept Bitcoin payments using their own
Bitcoin wallets and dedicated payment-processing infrastructure (BTCPay Server) that
Hachisu provisions and manages for their stores. Understanding this architecture is
central to these Terms:

- **Hachisu is non-custodial.** We never hold, control, or transmit your Bitcoin. Payments
  to your store are received by wallets you control.
- **We never possess your private keys.** Hachisu does not collect, store, or have access
  to private keys, seed phrases, or recovery phrases, and has no ability to recover them
  if you lose them. When you connect a wallet, you provide only public wallet information
  (an extended public key or output descriptor), which can generate receiving addresses
  but cannot spend Bitcoin.
- **We do not control the Bitcoin network.** The Bitcoin network is a decentralized system
  operated by independent participants worldwide.
- **We cannot reverse transactions.** Hachisu cannot reverse, cancel, charge back, or
  recover a confirmed Bitcoin transaction, and cannot recover funds sent to an incorrect
  Bitcoin address.

Hachisu does **not** provide: Bitcoin trading or exchange services, fiat currency
conversion, investment services, lending, interest-bearing accounts, custodial wallets, or
money transmission on your behalf. Hachisu is not a bank, and your use of the Service does
not create a deposit account, banking relationship, or fiduciary relationship. Nothing in
the Service is investment, financial, tax, accounting, or legal advice.

[NOTE FOR REVIEW: counsel to confirm the regulatory characterization of the Service,
including money-transmission analysis, before launch.]

## 3. Eligibility and Business Use

To use the Service you must:

- be at least 18 years old and able to form a binding contract;
- use the Service for business/commercial purposes — the Service is built for merchants,
  not for personal consumer banking or saving; and
- not be prohibited from using the Service under applicable law, including U.S. sanctions
  laws (see Section 13).

If you use the Service on behalf of a company or other entity, you represent that you are
authorized to bind that entity, and "you" includes that entity.

## 4. Your Account

### 4.1 Registration and accuracy

You register with an email address (verified by one-time passcode) or, where available, a
Google account. You agree to provide accurate, current, and complete information — including
your profile and business information (such as business name, address, country, website,
and description) — and to keep it up to date.

### 4.2 Account security

You are responsible for everything that happens under your account. Keep control of the
email account and any Google account you use to sign in, and of any device where you are
signed in; anyone with access to them can access your Hachisu account. Notify us promptly
at [SUPPORT EMAIL] if you suspect unauthorized access.

## 5. Merchant Stores

When you create a store, Hachisu provisions payment-processing infrastructure for it on
BTCPay Server. You may create and manage one or more stores, and you are responsible for
the names, descriptions, currencies, and settings you configure. Store names and other
content you enter must not be unlawful, deceptive, or infringing.

## 6. Bitcoin Wallet Connections

### 6.1 Public wallet information

To receive on-chain Bitcoin payments, you connect your own Bitcoin wallet by providing
public wallet information — an extended public key (xpub) or output descriptor. An extended
public key is **not** a private key: it lets software derive receiving addresses and view
related activity, but it cannot spend your Bitcoin.

By connecting a wallet, you authorize Hachisu to transmit that public wallet information to
your store's payment-processing infrastructure and to use it to derive receiving
addresses, generate invoices, and display balances and activity for your store — the
Service's intended payment functionality. Hachisu stores only a one-way cryptographic
fingerprint of the wallet scheme and non-sensitive metadata (such as address type), not
the key material itself.

### 6.2 Your responsibility to verify

**You are responsible for verifying your wallet information before accepting payments.**
Payments to addresses derived from the wallet information you provide go to whatever
wallet that information actually describes. Before going live, confirm — using your own
wallet software — that addresses shown by the Service belong to your wallet. If you
connect the wrong wallet, a wallet you do not control, or a wallet whose keys you have
lost, payments sent to it may be unrecoverable, and Hachisu cannot retrieve them.

### 6.3 Wallet custody and backups

Your wallet, keys, and seed phrases are yours alone. You are responsible for safeguarding
and backing them up. Hachisu cannot recover lost keys or seed phrases, and losing them may
mean permanently losing access to your Bitcoin.

## 7. Invoices, Payment Requests, POS, and Pay Button

The Service lets you create Bitcoin invoices and payment requests, run point-of-sale (POS)
checkouts, and generate a Pay Button; these produce checkout pages and links served by
your store's payment infrastructure, which you or your customers use to complete payment.

You are solely responsible for:

- the amounts, currencies, descriptions, product names, and prices you configure;
- the goods and services you sell, and delivering them;
- your refund, cancellation, and dispute policies — and honoring them. Because Hachisu
  cannot reverse Bitcoin transactions, any refund is something **you** pay from your own
  funds as a new transaction;
- handling your customers' questions, complaints, and disputes;
- charging, collecting, and remitting any applicable taxes;
- any consumer disclosures required for your business; and
- any customer information (such as email addresses) you choose to enter into the Service,
  including having the right to provide it.

Hachisu is a software provider, not a party to your sales. **Hachisu is not the merchant
of record for your transactions** and has no responsibility to your customers for the
goods or services you sell.

## 8. Bitcoin Network Risks

You acknowledge and accept the risks inherent in Bitcoin payments, including:

- **Irreversibility.** Confirmed Bitcoin transactions cannot be reversed, charged back, or
  recalled by anyone, including Hachisu.
- **Confirmation delays.** The Bitcoin network confirms transactions at variable speeds;
  a payment may show as pending for minutes to hours, and an unconfirmed transaction may
  never confirm.
- **Network fees.** Bitcoin transactions incur network (miner) fees set by market
  conditions, not by Hachisu. Fees paid by your customers, or fees you pay when moving
  your own funds, can vary widely.
- **Price volatility.** The Bitcoin/fiat exchange rate changes constantly. Fiat-denominated
  amounts shown in the Service are approximations based on third-party rate sources and
  may differ from rates elsewhere or at settlement.
- **Public ledger.** Bitcoin transactions are recorded on a public blockchain, permanently
  and visibly to anyone (see the Privacy Notice for details).
- **Protocol risk.** The Bitcoin network's rules and performance are outside our control
  and may change.

Underpayments, overpayments, expired invoices, and payments sent after an invoice's
validity window are handled by the payment infrastructure's rules and, ultimately, are
matters between you and your customer.

## 9. Third-Party Infrastructure and Services

The Service depends on infrastructure and services we do not fully control, including:

- **BTCPay Server** payment-processing infrastructure, which generates invoices, checkout
  pages, and payment detection for your stores;
- **Supabase**, which hosts our backend (authentication, database, and server functions);
- **Google**, if you choose Google sign-in;
- **third-party exchange-rate sources** used to price invoices and display fiat values; and
- **your own wallet software**, which is chosen, operated, and secured by you. Hachisu is
  not responsible for third-party wallets, and their makers are not responsible for
  Hachisu.

Third-party services have their own terms and may change, fail, or become unavailable in
ways that affect the Service.

## 10. Availability

We aim to keep the Service available and working well, but we do not promise uninterrupted
or error-free operation. The Service may be unavailable due to maintenance, outages
(including outages of the third-party infrastructure above), or events beyond our control.
The Bitcoin network itself continues to operate independently of the Service: an outage of
Hachisu does not move or block Bitcoin already paid to your wallet, but it may temporarily
prevent creating invoices or viewing activity. We may change, add, or remove features of
the Service at any time (see Section 20).

## 11. Fees

Hachisu does not currently charge fees for the Service. Bitcoin network (miner) fees,
which are paid to the Bitcoin network and not to Hachisu, always apply to on-chain
transactions. If we introduce fees for the Service in the future, we will disclose them
before they apply to you.

## 12. Prohibited Uses

You may not use the Service to:

- sell or facilitate anything illegal under the laws that apply to you or your customers,
  including controlled substances, stolen goods, or unlawful weapons;
- engage in fraud, money laundering, terrorist financing, or other financial crime;
- deceive or mislead customers, including through false product descriptions, fake
  invoices, or impersonation of another business;
- infringe others' intellectual-property, privacy, or publicity rights;
- interfere with or attempt to compromise the Service, its infrastructure, or other users'
  accounts, or access the Service by automated means we have not authorized;
- circumvent limits, gates, or security controls in the Service; or
- violate sanctions or export-control laws (Section 13).

We may investigate suspected violations and may suspend or terminate accounts involved in
them (Section 17).

## 13. Sanctions and Legal Compliance

You represent that you are not (a) located, organized, or resident in a country or region
subject to comprehensive U.S. sanctions, or (b) named on any U.S. government restricted-
party list, including the Treasury Department's list of Specially Designated Nationals.
You agree not to use the Service for the benefit of any such country, region, or person,
and to comply with applicable export-control laws.

**You are responsible for complying with all laws that apply to your business**, including
licensing, consumer-protection, privacy, tax, recordkeeping, and any financial-services
regulations applicable to merchants accepting cryptocurrency in your jurisdiction. Hachisu
does not warrant that the Service is appropriate or lawful for your particular business or
location.

[NOTE FOR REVIEW: sanctions and compliance language to be reviewed by counsel.]

## 14. Records and Reports

The Service lets you view payment activity and export CSV reports and monthly account
statements. These are provided for your convenience and are generated from the payment
infrastructure's records. **You are responsible for your own recordkeeping**, including
keeping the books, records, and tax documentation your business requires, and for
exporting anything you want to keep before closing your account. We do not guarantee that
the Service will retain or reproduce records indefinitely.

## 15. Intellectual Property

The Service — including the app, its design, and its content (other than what you and
other users provide) — is owned by [LEGAL ENTITY NAME] and its licensors and is protected
by intellectual-property laws. We grant you a limited, non-exclusive, non-transferable,
revocable license to use the app for your business use of the Service under these Terms.
You may not copy, modify, distribute, sell, or lease any part of the Service, or reverse
engineer it except where the law permits despite this restriction.

You keep ownership of the content you enter into the Service (store names, product lists,
invoice details, and similar). You grant us the license needed to host, process, display,
and transmit that content in order to operate the Service.

## 16. Feedback

If you send us ideas, suggestions, or other feedback about the Service, you agree we may
use it without restriction or obligation to you. Feedback is voluntary; we won't claim
ownership of your business by virtue of your feedback, just the right to use the feedback
itself.

## 17. Suspension and Termination

You may stop using the Service at any time.

We may suspend or terminate your access to the Service, or specific features, if we
reasonably believe you have violated these Terms or applicable law, if required by a legal
authority, or to protect the Service or other users. Where practical and lawful, we will
give you notice and a chance to export your records.

Because Hachisu is non-custodial, suspension or termination of your account does not give
Hachisu control over your Bitcoin: funds already received to your wallets remain yours and
are unaffected. Termination ends your license to use the Service; Sections of these Terms
that by their nature should survive (including Sections 18, 19, and 21–23) survive.

## 18. Account Deletion

You may permanently delete your account in the app (Account → Close Account). Deletion is
immediate and irreversible: your Hachisu account and application data (profile, stores,
invoices, payment requests, POS configuration, and related records) are permanently
deleted, and the payment-processing stores Hachisu provisioned for your account are
removed, so no new invoices or checkout pages can be created. The payment infrastructure
retains historical invoice records — a previously issued invoice or checkout page may
remain viewable, and an invoice still within its validity window at deletion remains
payable, to your own wallet, until it expires. Residual copies in backups and logs, and
Bitcoin blockchain records, are handled as described in the Privacy Notice and cannot all
be deleted by Hachisu. **Export any reports you need, and confirm you have your own wallet
backups, before deleting your account.** Deleting your account does not move, delete, or
otherwise affect Bitcoin in your wallets.

## 19. Disclaimers

THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE," WITHOUT WARRANTIES OF ANY KIND,
WHETHER EXPRESS, IMPLIED, OR STATUTORY, INCLUDING IMPLIED WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE, TITLE, AND NON-INFRINGEMENT. WITHOUT LIMITING THE
FOREGOING, WE DO NOT WARRANT THAT:

- THE SERVICE WILL BE UNINTERRUPTED, TIMELY, SECURE, OR ERROR-FREE;
- PAYMENT DETECTION, BALANCES, EXCHANGE RATES, OR REPORTS WILL BE ACCURATE OR COMPLETE;
- THE BITCOIN NETWORK WILL OPERATE IN ANY PARTICULAR WAY; OR
- THE SERVICE IS SUITABLE OR LAWFUL FOR YOUR PARTICULAR BUSINESS.

SOME JURISDICTIONS DO NOT ALLOW CERTAIN WARRANTY DISCLAIMERS, SO SOME OF THE ABOVE MAY NOT
APPLY TO YOU.

[NOTE FOR REVIEW: disclaimers to be reviewed by counsel.]

## 20. Changes to the Service and These Terms

We may change the Service over time, including adding, modifying, gating, or removing
features. We may also update these Terms. If we make material changes to these Terms, we
will notify you (in the app or by email) before they take effect and update the effective
date above. If you continue using the Service after updated Terms take effect, the updated
Terms apply. If you do not agree to updated Terms, stop using the Service and, if you
wish, delete your account.

## 21. Limitation of Liability

TO THE MAXIMUM EXTENT PERMITTED BY LAW: (A) HACHISU AND ITS OFFICERS, DIRECTORS,
EMPLOYEES, AND AGENTS WILL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL,
CONSEQUENTIAL, EXEMPLARY, OR PUNITIVE DAMAGES, OR FOR ANY LOSS OF PROFITS, REVENUE,
BUSINESS, GOODWILL, OR DATA, OR FOR ANY LOSS OF BITCOIN OR OTHER DIGITAL ASSETS — INCLUDING
LOSSES ARISING FROM INCORRECT WALLET INFORMATION, LOST PRIVATE KEYS OR SEED PHRASES,
BITCOIN NETWORK BEHAVIOR, EXCHANGE-RATE MOVEMENTS, OR THIRD-PARTY INFRASTRUCTURE — EVEN IF
ADVISED OF THE POSSIBILITY; AND (B) HACHISU'S TOTAL AGGREGATE LIABILITY ARISING OUT OF OR
RELATING TO THE SERVICE OR THESE TERMS WILL NOT EXCEED THE GREATER OF (i) THE AMOUNTS YOU
PAID HACHISU FOR THE SERVICE IN THE TWELVE MONTHS BEFORE THE CLAIM AROSE AND (ii) ONE
HUNDRED U.S. DOLLARS (US$100).

SOME JURISDICTIONS DO NOT ALLOW CERTAIN LIMITATIONS OF LIABILITY, SO SOME OF THE ABOVE MAY
NOT APPLY TO YOU. NOTHING IN THESE TERMS LIMITS LIABILITY THAT CANNOT LAWFULLY BE LIMITED.

[NOTE FOR REVIEW: limitation of liability to be reviewed by counsel.]

## 22. Indemnification

You agree to indemnify and hold harmless Hachisu and its officers, directors, employees,
and agents from and against claims, damages, losses, and expenses (including reasonable
attorneys' fees) arising out of or related to: (a) your use of the Service; (b) the goods
or services you sell and your dealings with your customers, including refunds, disputes,
and consumer-protection claims; (c) your violation of these Terms or of applicable law,
including tax, licensing, and sanctions laws; or (d) content or information you provide,
including customer information and wallet information. We will notify you of any such
claim and may participate in its defense with counsel of our choosing.

[NOTE FOR REVIEW: indemnification to be reviewed by counsel.]

## 23. Governing Law and Dispute Resolution

These Terms are governed by the laws of [GOVERNING LAW STATE], without regard to its
conflict-of-laws rules.

**Dispute resolution:** [ARBITRATION / DISPUTE RESOLUTION TO BE REVIEWED BY COUNSEL]

[NOTE FOR REVIEW: counsel to decide whether to adopt arbitration, any class-action
waiver, small-claims carve-outs, opt-out mechanics, and venue.]

## 24. Miscellaneous

- **Entire agreement.** These Terms, the Privacy Notice, and the E-Sign Consent are the
  entire agreement between you and Hachisu about the Service.
- **Severability.** If a provision of these Terms is unenforceable, the rest remains in
  effect.
- **No waiver.** Our not enforcing a provision is not a waiver of it.
- **Assignment.** You may not assign these Terms without our consent; we may assign them
  in connection with a merger, acquisition, or sale of assets.
- **Notices.** We provide notices as described in the E-Sign Consent; you may contact us
  at the addresses below.

## 25. Contact

- Email: [SUPPORT EMAIL]
- Mail: [LEGAL ENTITY NAME], [MAILING ADDRESS]
