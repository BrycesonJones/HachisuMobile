/**
 * GENERATED FILE — DO NOT EDIT BY HAND.
 *
 * Source of truth: docs/legal/*.md. Regenerate with `npm run generate:legal`
 * (scripts/generate-legal-content.js) after any legal-text change, and bump the
 * matching CURRENT_*_VERSION in constants/legal.ts when the change is a new
 * legal version. Internal attorney-review annotations are stripped here;
 * unresolved placeholders (e.g. [LEGAL ENTITY NAME]) are intentionally kept.
 */

export interface LegalInlineSegment {
  text: string;
  bold: boolean;
}

export interface LegalBlock {
  type: 'title' | 'heading' | 'paragraph' | 'listItem';
  segments: LegalInlineSegment[];
}

export const LEGAL_CONTENT: Record<string, readonly LegalBlock[]> = {
  "terms-of-service": [
    {
      "type": "title",
      "segments": [
        {
          "text": "Hachisu Terms of Service",
          "bold": false
        }
      ]
    },
    {
      "type": "paragraph",
      "segments": [
        {
          "text": "Effective date:",
          "bold": true
        },
        {
          "text": " August 1, 2026",
          "bold": false
        }
      ]
    },
    {
      "type": "paragraph",
      "segments": [
        {
          "text": "These Terms of Service (\"Terms\") are an agreement between you and Hachisu (\"we,\" \"us,\" or \"our\") governing your use of the Hachisu mobile application and the backend services that power it (together, the \"Service\").",
          "bold": false
        }
      ]
    },
    {
      "type": "heading",
      "segments": [
        {
          "text": "1. Acceptance of These Terms",
          "bold": false
        }
      ]
    },
    {
      "type": "paragraph",
      "segments": [
        {
          "text": "By creating an account, tapping \"I agree\" (or a similar control), or using the Service, you accept these Terms, our Privacy Notice, and our Electronic Communications and E-Sign Consent. If you do not agree, do not use the Service.",
          "bold": false
        }
      ]
    },
    {
      "type": "heading",
      "segments": [
        {
          "text": "2. What Hachisu Is (and Is Not)",
          "bold": false
        }
      ]
    },
    {
      "type": "paragraph",
      "segments": [
        {
          "text": "Hachisu is ",
          "bold": false
        },
        {
          "text": "software",
          "bold": true
        },
        {
          "text": " that helps merchants accept Bitcoin payments using their own Bitcoin wallets and dedicated payment-processing infrastructure (BTCPay Server) that Hachisu provisions and manages for their stores. Understanding this architecture is central to these Terms:",
          "bold": false
        }
      ]
    },
    {
      "type": "listItem",
      "segments": [
        {
          "text": "Hachisu is non-custodial.",
          "bold": true
        },
        {
          "text": " We never hold, control, or transmit your Bitcoin. Payments to your store are received by wallets you control.",
          "bold": false
        }
      ]
    },
    {
      "type": "listItem",
      "segments": [
        {
          "text": "We never possess your private keys.",
          "bold": true
        },
        {
          "text": " Hachisu does not collect, store, or have access to private keys, seed phrases, or recovery phrases, and has no ability to recover them if you lose them. When you connect a wallet, you provide only public wallet information (an extended public key or output descriptor), which can generate receiving addresses but cannot spend Bitcoin.",
          "bold": false
        }
      ]
    },
    {
      "type": "listItem",
      "segments": [
        {
          "text": "We do not control the Bitcoin network.",
          "bold": true
        },
        {
          "text": " The Bitcoin network is a decentralized system operated by independent participants worldwide.",
          "bold": false
        }
      ]
    },
    {
      "type": "listItem",
      "segments": [
        {
          "text": "We cannot reverse transactions.",
          "bold": true
        },
        {
          "text": " Hachisu cannot reverse, cancel, charge back, or recover a confirmed Bitcoin transaction, and cannot recover funds sent to an incorrect Bitcoin address.",
          "bold": false
        }
      ]
    },
    {
      "type": "paragraph",
      "segments": [
        {
          "text": "Hachisu does ",
          "bold": false
        },
        {
          "text": "not",
          "bold": true
        },
        {
          "text": " provide: Bitcoin trading or exchange services, fiat currency conversion, investment services, lending, interest-bearing accounts, custodial wallets, or money transmission on your behalf. Hachisu is not a bank, and your use of the Service does not create a deposit account, banking relationship, or fiduciary relationship. Nothing in the Service is investment, financial, tax, accounting, or legal advice.",
          "bold": false
        }
      ]
    },
    {
      "type": "heading",
      "segments": [
        {
          "text": "3. Eligibility and Business Use",
          "bold": false
        }
      ]
    },
    {
      "type": "paragraph",
      "segments": [
        {
          "text": "To use the Service you must:",
          "bold": false
        }
      ]
    },
    {
      "type": "listItem",
      "segments": [
        {
          "text": "be at least 18 years old and able to form a binding contract;",
          "bold": false
        }
      ]
    },
    {
      "type": "listItem",
      "segments": [
        {
          "text": "use the Service for business/commercial purposes — the Service is built for merchants, not for personal consumer banking or saving; and",
          "bold": false
        }
      ]
    },
    {
      "type": "listItem",
      "segments": [
        {
          "text": "not be prohibited from using the Service under applicable law, including U.S. sanctions laws (see Section 13).",
          "bold": false
        }
      ]
    },
    {
      "type": "paragraph",
      "segments": [
        {
          "text": "If you use the Service on behalf of a company or other entity, you represent that you are authorized to bind that entity, and \"you\" includes that entity.",
          "bold": false
        }
      ]
    },
    {
      "type": "heading",
      "segments": [
        {
          "text": "4. Your Account",
          "bold": false
        }
      ]
    },
    {
      "type": "heading",
      "segments": [
        {
          "text": "4.1 Registration and accuracy",
          "bold": false
        }
      ]
    },
    {
      "type": "paragraph",
      "segments": [
        {
          "text": "You register with an email address (verified by one-time passcode) or, where available, a Google account. You agree to provide accurate, current, and complete information — including your profile and business information (such as business name, address, country, website, and description) — and to keep it up to date.",
          "bold": false
        }
      ]
    },
    {
      "type": "heading",
      "segments": [
        {
          "text": "4.2 Account security",
          "bold": false
        }
      ]
    },
    {
      "type": "paragraph",
      "segments": [
        {
          "text": "You are responsible for everything that happens under your account. Keep control of the email account and any Google account you use to sign in, and of any device where you are signed in; anyone with access to them can access your Hachisu account. Notify us promptly through the Contact form at https://hachisu.io/#contact if you suspect unauthorized access.",
          "bold": false
        }
      ]
    },
    {
      "type": "heading",
      "segments": [
        {
          "text": "5. Merchant Stores",
          "bold": false
        }
      ]
    },
    {
      "type": "paragraph",
      "segments": [
        {
          "text": "When you create a store, Hachisu provisions payment-processing infrastructure for it on BTCPay Server. You may create and manage one or more stores, and you are responsible for the names, descriptions, currencies, and settings you configure. Store names and other content you enter must not be unlawful, deceptive, or infringing.",
          "bold": false
        }
      ]
    },
    {
      "type": "heading",
      "segments": [
        {
          "text": "6. Bitcoin Wallet Connections",
          "bold": false
        }
      ]
    },
    {
      "type": "heading",
      "segments": [
        {
          "text": "6.1 Public wallet information",
          "bold": false
        }
      ]
    },
    {
      "type": "paragraph",
      "segments": [
        {
          "text": "To receive on-chain Bitcoin payments, you connect your own Bitcoin wallet by providing public wallet information — an extended public key (xpub) or output descriptor. An extended public key is ",
          "bold": false
        },
        {
          "text": "not",
          "bold": true
        },
        {
          "text": " a private key: it lets software derive receiving addresses and view related activity, but it cannot spend your Bitcoin.",
          "bold": false
        }
      ]
    },
    {
      "type": "paragraph",
      "segments": [
        {
          "text": "By connecting a wallet, you authorize Hachisu to transmit that public wallet information to your store's payment-processing infrastructure and to use it to derive receiving addresses, generate invoices, and display balances and activity for your store — the Service's intended payment functionality. Hachisu stores only a one-way cryptographic fingerprint of the wallet scheme and non-sensitive metadata (such as address type), not the key material itself.",
          "bold": false
        }
      ]
    },
    {
      "type": "heading",
      "segments": [
        {
          "text": "6.2 Your responsibility to verify",
          "bold": false
        }
      ]
    },
    {
      "type": "paragraph",
      "segments": [
        {
          "text": "You are responsible for verifying your wallet information before accepting payments.",
          "bold": true
        },
        {
          "text": " Payments to addresses derived from the wallet information you provide go to whatever wallet that information actually describes. Before going live, confirm — using your own wallet software — that addresses shown by the Service belong to your wallet. If you connect the wrong wallet, a wallet you do not control, or a wallet whose keys you have lost, payments sent to it may be unrecoverable, and Hachisu cannot retrieve them.",
          "bold": false
        }
      ]
    },
    {
      "type": "heading",
      "segments": [
        {
          "text": "6.3 Wallet custody and backups",
          "bold": false
        }
      ]
    },
    {
      "type": "paragraph",
      "segments": [
        {
          "text": "Your wallet, keys, and seed phrases are yours alone. You are responsible for safeguarding and backing them up. Hachisu cannot recover lost keys or seed phrases, and losing them may mean permanently losing access to your Bitcoin.",
          "bold": false
        }
      ]
    },
    {
      "type": "heading",
      "segments": [
        {
          "text": "7. Invoices, Payment Requests, POS, and Pay Button",
          "bold": false
        }
      ]
    },
    {
      "type": "paragraph",
      "segments": [
        {
          "text": "The Service lets you create Bitcoin invoices and payment requests, run point-of-sale (POS) checkouts, and generate a Pay Button; these produce checkout pages and links served by your store's payment infrastructure, which you or your customers use to complete payment.",
          "bold": false
        }
      ]
    },
    {
      "type": "paragraph",
      "segments": [
        {
          "text": "You are solely responsible for:",
          "bold": false
        }
      ]
    },
    {
      "type": "listItem",
      "segments": [
        {
          "text": "the amounts, currencies, descriptions, product names, and prices you configure;",
          "bold": false
        }
      ]
    },
    {
      "type": "listItem",
      "segments": [
        {
          "text": "the goods and services you sell, and delivering them;",
          "bold": false
        }
      ]
    },
    {
      "type": "listItem",
      "segments": [
        {
          "text": "your refund, cancellation, and dispute policies — and honoring them. Because Hachisu cannot reverse Bitcoin transactions, any refund is something ",
          "bold": false
        },
        {
          "text": "you",
          "bold": true
        },
        {
          "text": " pay from your own funds as a new transaction;",
          "bold": false
        }
      ]
    },
    {
      "type": "listItem",
      "segments": [
        {
          "text": "handling your customers' questions, complaints, and disputes;",
          "bold": false
        }
      ]
    },
    {
      "type": "listItem",
      "segments": [
        {
          "text": "charging, collecting, and remitting any applicable taxes;",
          "bold": false
        }
      ]
    },
    {
      "type": "listItem",
      "segments": [
        {
          "text": "any consumer disclosures required for your business; and",
          "bold": false
        }
      ]
    },
    {
      "type": "listItem",
      "segments": [
        {
          "text": "any customer information (such as email addresses) you choose to enter into the Service, including having the right to provide it.",
          "bold": false
        }
      ]
    },
    {
      "type": "paragraph",
      "segments": [
        {
          "text": "Hachisu is a software provider, not a party to your sales. ",
          "bold": false
        },
        {
          "text": "Hachisu is not the merchant of record for your transactions",
          "bold": true
        },
        {
          "text": " and has no responsibility to your customers for the goods or services you sell.",
          "bold": false
        }
      ]
    },
    {
      "type": "heading",
      "segments": [
        {
          "text": "8. Bitcoin Network Risks",
          "bold": false
        }
      ]
    },
    {
      "type": "paragraph",
      "segments": [
        {
          "text": "You acknowledge and accept the risks inherent in Bitcoin payments, including:",
          "bold": false
        }
      ]
    },
    {
      "type": "listItem",
      "segments": [
        {
          "text": "Irreversibility.",
          "bold": true
        },
        {
          "text": " Confirmed Bitcoin transactions cannot be reversed, charged back, or recalled by anyone, including Hachisu.",
          "bold": false
        }
      ]
    },
    {
      "type": "listItem",
      "segments": [
        {
          "text": "Confirmation delays.",
          "bold": true
        },
        {
          "text": " The Bitcoin network confirms transactions at variable speeds; a payment may show as pending for minutes to hours, and an unconfirmed transaction may never confirm.",
          "bold": false
        }
      ]
    },
    {
      "type": "listItem",
      "segments": [
        {
          "text": "Network fees.",
          "bold": true
        },
        {
          "text": " Bitcoin transactions incur network (miner) fees set by market conditions, not by Hachisu. Fees paid by your customers, or fees you pay when moving your own funds, can vary widely.",
          "bold": false
        }
      ]
    },
    {
      "type": "listItem",
      "segments": [
        {
          "text": "Price volatility.",
          "bold": true
        },
        {
          "text": " The Bitcoin/fiat exchange rate changes constantly. Fiat-denominated amounts shown in the Service are approximations based on third-party rate sources and may differ from rates elsewhere or at settlement.",
          "bold": false
        }
      ]
    },
    {
      "type": "listItem",
      "segments": [
        {
          "text": "Public ledger.",
          "bold": true
        },
        {
          "text": " Bitcoin transactions are recorded on a public blockchain, permanently and visibly to anyone (see the Privacy Notice for details).",
          "bold": false
        }
      ]
    },
    {
      "type": "listItem",
      "segments": [
        {
          "text": "Protocol risk.",
          "bold": true
        },
        {
          "text": " The Bitcoin network's rules and performance are outside our control and may change.",
          "bold": false
        }
      ]
    },
    {
      "type": "paragraph",
      "segments": [
        {
          "text": "Underpayments, overpayments, expired invoices, and payments sent after an invoice's validity window are handled by the payment infrastructure's rules and, ultimately, are matters between you and your customer.",
          "bold": false
        }
      ]
    },
    {
      "type": "heading",
      "segments": [
        {
          "text": "9. Third-Party Infrastructure and Services",
          "bold": false
        }
      ]
    },
    {
      "type": "paragraph",
      "segments": [
        {
          "text": "The Service depends on infrastructure and services we do not fully control, including:",
          "bold": false
        }
      ]
    },
    {
      "type": "listItem",
      "segments": [
        {
          "text": "BTCPay Server",
          "bold": true
        },
        {
          "text": " payment-processing infrastructure, which generates invoices, checkout pages, and payment detection for your stores;",
          "bold": false
        }
      ]
    },
    {
      "type": "listItem",
      "segments": [
        {
          "text": "Supabase",
          "bold": true
        },
        {
          "text": ", which hosts our backend (authentication, database, and server functions);",
          "bold": false
        }
      ]
    },
    {
      "type": "listItem",
      "segments": [
        {
          "text": "Google",
          "bold": true
        },
        {
          "text": ", if you choose Google sign-in;",
          "bold": false
        }
      ]
    },
    {
      "type": "listItem",
      "segments": [
        {
          "text": "third-party exchange-rate sources",
          "bold": true
        },
        {
          "text": " used to price invoices and display fiat values; and",
          "bold": false
        }
      ]
    },
    {
      "type": "listItem",
      "segments": [
        {
          "text": "your own wallet software",
          "bold": true
        },
        {
          "text": ", which is chosen, operated, and secured by you. Hachisu is not responsible for third-party wallets, and their makers are not responsible for Hachisu.",
          "bold": false
        }
      ]
    },
    {
      "type": "paragraph",
      "segments": [
        {
          "text": "Third-party services have their own terms and may change, fail, or become unavailable in ways that affect the Service.",
          "bold": false
        }
      ]
    },
    {
      "type": "heading",
      "segments": [
        {
          "text": "10. Availability",
          "bold": false
        }
      ]
    },
    {
      "type": "paragraph",
      "segments": [
        {
          "text": "We aim to keep the Service available and working well, but we do not promise uninterrupted or error-free operation. The Service may be unavailable due to maintenance, outages (including outages of the third-party infrastructure above), or events beyond our control. The Bitcoin network itself continues to operate independently of the Service: an outage of Hachisu does not move or block Bitcoin already paid to your wallet, but it may temporarily prevent creating invoices or viewing activity. We may change, add, or remove features of the Service at any time (see Section 20).",
          "bold": false
        }
      ]
    },
    {
      "type": "heading",
      "segments": [
        {
          "text": "11. Fees",
          "bold": false
        }
      ]
    },
    {
      "type": "paragraph",
      "segments": [
        {
          "text": "Hachisu does not currently charge fees for the Service. Bitcoin network (miner) fees, which are paid to the Bitcoin network and not to Hachisu, always apply to on-chain transactions. If we introduce fees for the Service in the future, we will disclose them before they apply to you.",
          "bold": false
        }
      ]
    },
    {
      "type": "heading",
      "segments": [
        {
          "text": "12. Prohibited Uses",
          "bold": false
        }
      ]
    },
    {
      "type": "paragraph",
      "segments": [
        {
          "text": "You may not use the Service to:",
          "bold": false
        }
      ]
    },
    {
      "type": "listItem",
      "segments": [
        {
          "text": "sell or facilitate anything illegal under the laws that apply to you or your customers, including controlled substances, stolen goods, or unlawful weapons;",
          "bold": false
        }
      ]
    },
    {
      "type": "listItem",
      "segments": [
        {
          "text": "engage in fraud, money laundering, terrorist financing, or other financial crime;",
          "bold": false
        }
      ]
    },
    {
      "type": "listItem",
      "segments": [
        {
          "text": "deceive or mislead customers, including through false product descriptions, fake invoices, or impersonation of another business;",
          "bold": false
        }
      ]
    },
    {
      "type": "listItem",
      "segments": [
        {
          "text": "infringe others' intellectual-property, privacy, or publicity rights;",
          "bold": false
        }
      ]
    },
    {
      "type": "listItem",
      "segments": [
        {
          "text": "interfere with or attempt to compromise the Service, its infrastructure, or other users' accounts, or access the Service by automated means we have not authorized;",
          "bold": false
        }
      ]
    },
    {
      "type": "listItem",
      "segments": [
        {
          "text": "circumvent limits, gates, or security controls in the Service; or",
          "bold": false
        }
      ]
    },
    {
      "type": "listItem",
      "segments": [
        {
          "text": "violate sanctions or export-control laws (Section 13).",
          "bold": false
        }
      ]
    },
    {
      "type": "paragraph",
      "segments": [
        {
          "text": "We may investigate suspected violations and may suspend or terminate accounts involved in them (Section 17).",
          "bold": false
        }
      ]
    },
    {
      "type": "heading",
      "segments": [
        {
          "text": "13. Sanctions and Legal Compliance",
          "bold": false
        }
      ]
    },
    {
      "type": "paragraph",
      "segments": [
        {
          "text": "You represent that you are not (a) located, organized, or resident in a country or region subject to comprehensive U.S. sanctions, or (b) named on any U.S. government restricted- party list, including the Treasury Department's list of Specially Designated Nationals. You agree not to use the Service for the benefit of any such country, region, or person, and to comply with applicable export-control laws.",
          "bold": false
        }
      ]
    },
    {
      "type": "paragraph",
      "segments": [
        {
          "text": "You are responsible for complying with all laws that apply to your business",
          "bold": true
        },
        {
          "text": ", including licensing, consumer-protection, privacy, tax, recordkeeping, and any financial-services regulations applicable to merchants accepting cryptocurrency in your jurisdiction. Hachisu does not warrant that the Service is appropriate or lawful for your particular business or location.",
          "bold": false
        }
      ]
    },
    {
      "type": "heading",
      "segments": [
        {
          "text": "14. Records and Reports",
          "bold": false
        }
      ]
    },
    {
      "type": "paragraph",
      "segments": [
        {
          "text": "The Service lets you view payment activity and export CSV reports and monthly account statements. These are provided for your convenience and are generated from the payment infrastructure's records. ",
          "bold": false
        },
        {
          "text": "You are responsible for your own recordkeeping",
          "bold": true
        },
        {
          "text": ", including keeping the books, records, and tax documentation your business requires, and for exporting anything you want to keep before closing your account. We do not guarantee that the Service will retain or reproduce records indefinitely.",
          "bold": false
        }
      ]
    },
    {
      "type": "heading",
      "segments": [
        {
          "text": "15. Intellectual Property",
          "bold": false
        }
      ]
    },
    {
      "type": "paragraph",
      "segments": [
        {
          "text": "The Service — including the app, its design, and its content (other than what you and other users provide) — is owned by Hachisu and its licensors and is protected by intellectual-property laws. We grant you a limited, non-exclusive, non-transferable, revocable license to use the app for your business use of the Service under these Terms. You may not copy, modify, distribute, sell, or lease any part of the Service, or reverse engineer it except where the law permits despite this restriction.",
          "bold": false
        }
      ]
    },
    {
      "type": "paragraph",
      "segments": [
        {
          "text": "You keep ownership of the content you enter into the Service (store names, product lists, invoice details, and similar). You grant us the license needed to host, process, display, and transmit that content in order to operate the Service.",
          "bold": false
        }
      ]
    },
    {
      "type": "heading",
      "segments": [
        {
          "text": "16. Feedback",
          "bold": false
        }
      ]
    },
    {
      "type": "paragraph",
      "segments": [
        {
          "text": "If you send us ideas, suggestions, or other feedback about the Service, you agree we may use it without restriction or obligation to you. Feedback is voluntary; we won't claim ownership of your business by virtue of your feedback, just the right to use the feedback itself.",
          "bold": false
        }
      ]
    },
    {
      "type": "heading",
      "segments": [
        {
          "text": "17. Suspension and Termination",
          "bold": false
        }
      ]
    },
    {
      "type": "paragraph",
      "segments": [
        {
          "text": "You may stop using the Service at any time.",
          "bold": false
        }
      ]
    },
    {
      "type": "paragraph",
      "segments": [
        {
          "text": "We may suspend or terminate your access to the Service, or specific features, if we reasonably believe you have violated these Terms or applicable law, if required by a legal authority, or to protect the Service or other users. Where practical and lawful, we will give you notice and a chance to export your records.",
          "bold": false
        }
      ]
    },
    {
      "type": "paragraph",
      "segments": [
        {
          "text": "Because Hachisu is non-custodial, suspension or termination of your account does not give Hachisu control over your Bitcoin: funds already received to your wallets remain yours and are unaffected. Termination ends your license to use the Service; Sections of these Terms that by their nature should survive (including Sections 18, 19, and 21–23) survive.",
          "bold": false
        }
      ]
    },
    {
      "type": "heading",
      "segments": [
        {
          "text": "18. Account Deletion",
          "bold": false
        }
      ]
    },
    {
      "type": "paragraph",
      "segments": [
        {
          "text": "You may permanently delete your account in the app (Account → Close Account). Deletion is immediate and irreversible: your Hachisu account and application data (profile, stores, invoices, payment requests, POS configuration, and related records) are permanently deleted, and the payment-processing stores Hachisu provisioned for your account are removed, so no new invoices or checkout pages can be created. The payment infrastructure retains historical invoice records — a previously issued invoice or checkout page may remain viewable, and an invoice still within its validity window at deletion remains payable, to your own wallet, until it expires. Residual copies in backups and logs, and Bitcoin blockchain records, are handled as described in the Privacy Notice and cannot all be deleted by Hachisu. ",
          "bold": false
        },
        {
          "text": "Export any reports you need, and confirm you have your own wallet backups, before deleting your account.",
          "bold": true
        },
        {
          "text": " Deleting your account does not move, delete, or otherwise affect Bitcoin in your wallets.",
          "bold": false
        }
      ]
    },
    {
      "type": "heading",
      "segments": [
        {
          "text": "19. Disclaimers",
          "bold": false
        }
      ]
    },
    {
      "type": "paragraph",
      "segments": [
        {
          "text": "THE SERVICE IS PROVIDED \"AS IS\" AND \"AS AVAILABLE,\" WITHOUT WARRANTIES OF ANY KIND, WHETHER EXPRESS, IMPLIED, OR STATUTORY, INCLUDING IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, TITLE, AND NON-INFRINGEMENT. WITHOUT LIMITING THE FOREGOING, WE DO NOT WARRANT THAT:",
          "bold": false
        }
      ]
    },
    {
      "type": "listItem",
      "segments": [
        {
          "text": "THE SERVICE WILL BE UNINTERRUPTED, TIMELY, SECURE, OR ERROR-FREE;",
          "bold": false
        }
      ]
    },
    {
      "type": "listItem",
      "segments": [
        {
          "text": "PAYMENT DETECTION, BALANCES, EXCHANGE RATES, OR REPORTS WILL BE ACCURATE OR COMPLETE;",
          "bold": false
        }
      ]
    },
    {
      "type": "listItem",
      "segments": [
        {
          "text": "THE BITCOIN NETWORK WILL OPERATE IN ANY PARTICULAR WAY; OR",
          "bold": false
        }
      ]
    },
    {
      "type": "listItem",
      "segments": [
        {
          "text": "THE SERVICE IS SUITABLE OR LAWFUL FOR YOUR PARTICULAR BUSINESS.",
          "bold": false
        }
      ]
    },
    {
      "type": "paragraph",
      "segments": [
        {
          "text": "SOME JURISDICTIONS DO NOT ALLOW CERTAIN WARRANTY DISCLAIMERS, SO SOME OF THE ABOVE MAY NOT APPLY TO YOU.",
          "bold": false
        }
      ]
    },
    {
      "type": "heading",
      "segments": [
        {
          "text": "20. Changes to the Service and These Terms",
          "bold": false
        }
      ]
    },
    {
      "type": "paragraph",
      "segments": [
        {
          "text": "We may change the Service over time, including adding, modifying, gating, or removing features. We may also update these Terms. If we make material changes to these Terms, we will notify you (in the app or by email) before they take effect and update the effective date above. If you continue using the Service after updated Terms take effect, the updated Terms apply. If you do not agree to updated Terms, stop using the Service and, if you wish, delete your account.",
          "bold": false
        }
      ]
    },
    {
      "type": "heading",
      "segments": [
        {
          "text": "21. Limitation of Liability",
          "bold": false
        }
      ]
    },
    {
      "type": "paragraph",
      "segments": [
        {
          "text": "TO THE MAXIMUM EXTENT PERMITTED BY LAW: (A) HACHISU AND ITS OFFICERS, DIRECTORS, EMPLOYEES, AND AGENTS WILL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, EXEMPLARY, OR PUNITIVE DAMAGES, OR FOR ANY LOSS OF PROFITS, REVENUE, BUSINESS, GOODWILL, OR DATA, OR FOR ANY LOSS OF BITCOIN OR OTHER DIGITAL ASSETS — INCLUDING LOSSES ARISING FROM INCORRECT WALLET INFORMATION, LOST PRIVATE KEYS OR SEED PHRASES, BITCOIN NETWORK BEHAVIOR, EXCHANGE-RATE MOVEMENTS, OR THIRD-PARTY INFRASTRUCTURE — EVEN IF ADVISED OF THE POSSIBILITY; AND (B) HACHISU'S TOTAL AGGREGATE LIABILITY ARISING OUT OF OR RELATING TO THE SERVICE OR THESE TERMS WILL NOT EXCEED THE GREATER OF (i) THE AMOUNTS YOU PAID HACHISU FOR THE SERVICE IN THE TWELVE MONTHS BEFORE THE CLAIM AROSE AND (ii) ONE HUNDRED U.S. DOLLARS (US$100).",
          "bold": false
        }
      ]
    },
    {
      "type": "paragraph",
      "segments": [
        {
          "text": "SOME JURISDICTIONS DO NOT ALLOW CERTAIN LIMITATIONS OF LIABILITY, SO SOME OF THE ABOVE MAY NOT APPLY TO YOU. NOTHING IN THESE TERMS LIMITS LIABILITY THAT CANNOT LAWFULLY BE LIMITED.",
          "bold": false
        }
      ]
    },
    {
      "type": "heading",
      "segments": [
        {
          "text": "22. Indemnification",
          "bold": false
        }
      ]
    },
    {
      "type": "paragraph",
      "segments": [
        {
          "text": "You agree to indemnify and hold harmless Hachisu and its officers, directors, employees, and agents from and against claims, damages, losses, and expenses (including reasonable attorneys' fees) arising out of or related to: (a) your use of the Service; (b) the goods or services you sell and your dealings with your customers, including refunds, disputes, and consumer-protection claims; (c) your violation of these Terms or of applicable law, including tax, licensing, and sanctions laws; or (d) content or information you provide, including customer information and wallet information. We will notify you of any such claim and may participate in its defense with counsel of our choosing.",
          "bold": false
        }
      ]
    },
    {
      "type": "heading",
      "segments": [
        {
          "text": "23. Governing Law and Dispute Resolution",
          "bold": false
        }
      ]
    },
    {
      "type": "paragraph",
      "segments": [
        {
          "text": "These Terms are governed by the laws of [GOVERNING LAW STATE], without regard to its conflict-of-laws rules.",
          "bold": false
        }
      ]
    },
    {
      "type": "paragraph",
      "segments": [
        {
          "text": "Dispute resolution:",
          "bold": true
        },
        {
          "text": " [ARBITRATION / DISPUTE RESOLUTION TO BE REVIEWED BY COUNSEL]",
          "bold": false
        }
      ]
    },
    {
      "type": "heading",
      "segments": [
        {
          "text": "24. Miscellaneous",
          "bold": false
        }
      ]
    },
    {
      "type": "listItem",
      "segments": [
        {
          "text": "Entire agreement.",
          "bold": true
        },
        {
          "text": " These Terms, the Privacy Notice, and the E-Sign Consent are the entire agreement between you and Hachisu about the Service.",
          "bold": false
        }
      ]
    },
    {
      "type": "listItem",
      "segments": [
        {
          "text": "Severability.",
          "bold": true
        },
        {
          "text": " If a provision of these Terms is unenforceable, the rest remains in effect.",
          "bold": false
        }
      ]
    },
    {
      "type": "listItem",
      "segments": [
        {
          "text": "No waiver.",
          "bold": true
        },
        {
          "text": " Our not enforcing a provision is not a waiver of it.",
          "bold": false
        }
      ]
    },
    {
      "type": "listItem",
      "segments": [
        {
          "text": "Assignment.",
          "bold": true
        },
        {
          "text": " You may not assign these Terms without our consent; we may assign them in connection with a merger, acquisition, or sale of assets.",
          "bold": false
        }
      ]
    },
    {
      "type": "listItem",
      "segments": [
        {
          "text": "Notices.",
          "bold": true
        },
        {
          "text": " We provide notices as described in the E-Sign Consent; you may contact us at the addresses below.",
          "bold": false
        }
      ]
    },
    {
      "type": "heading",
      "segments": [
        {
          "text": "25. Contact",
          "bold": false
        }
      ]
    },
    {
      "type": "paragraph",
      "segments": [
        {
          "text": "You can reach us through the Contact form at https://hachisu.io/#contact.",
          "bold": false
        }
      ]
    }
  ],
  "e-sign-consent": [
    {
      "type": "title",
      "segments": [
        {
          "text": "Hachisu Electronic Communications and E-Sign Consent",
          "bold": false
        }
      ]
    },
    {
      "type": "paragraph",
      "segments": [
        {
          "text": "Effective date:",
          "bold": true
        },
        {
          "text": " August 1, 2026",
          "bold": false
        }
      ]
    },
    {
      "type": "paragraph",
      "segments": [
        {
          "text": "This Electronic Communications and E-Sign Consent (\"Consent\") explains how Hachisu (\"we,\" \"us\") delivers agreements, notices, and other communications to you electronically, and asks for your agreement to receive them that way. Please read it and keep a copy.",
          "bold": false
        }
      ]
    },
    {
      "type": "heading",
      "segments": [
        {
          "text": "1. Your Consent to Electronic Records",
          "bold": false
        }
      ]
    },
    {
      "type": "paragraph",
      "segments": [
        {
          "text": "By checking the consent box, tapping \"I agree\" (or a similar control), creating a Hachisu account, or continuing to use the Hachisu service, you agree that we may provide the following to you ",
          "bold": false
        },
        {
          "text": "electronically",
          "bold": true
        },
        {
          "text": " rather than on paper (\"Communications\"):",
          "bold": false
        }
      ]
    },
    {
      "type": "listItem",
      "segments": [
        {
          "text": "the Hachisu Terms of Service, Privacy Notice, and this Consent, including updates;",
          "bold": false
        }
      ]
    },
    {
      "type": "listItem",
      "segments": [
        {
          "text": "account notices and disclosures, including changes to terms or features;",
          "bold": false
        }
      ]
    },
    {
      "type": "listItem",
      "segments": [
        {
          "text": "transaction-related records available in the app, such as invoices, payment requests, activity, and reports you export;",
          "bold": false
        }
      ]
    },
    {
      "type": "listItem",
      "segments": [
        {
          "text": "support responses and other service messages; and",
          "bold": false
        }
      ]
    },
    {
      "type": "listItem",
      "segments": [
        {
          "text": "any other record or disclosure related to your account that we are permitted or required to provide.",
          "bold": false
        }
      ]
    },
    {
      "type": "heading",
      "segments": [
        {
          "text": "2. Electronic Signatures",
          "bold": false
        }
      ]
    },
    {
      "type": "paragraph",
      "segments": [
        {
          "text": "You agree that your electronic actions — such as checking a box, tapping a button labeled \"I agree\" or similar, entering a one-time passcode, or otherwise indicating assent within the app — constitute your electronic signature, and that agreements you enter this way are intended to be valid and enforceable to the same extent as if you had signed on paper.",
          "bold": false
        }
      ]
    },
    {
      "type": "heading",
      "segments": [
        {
          "text": "3. How We Deliver Communications",
          "bold": false
        }
      ]
    },
    {
      "type": "paragraph",
      "segments": [
        {
          "text": "We deliver Communications by one or more of the following methods:",
          "bold": false
        }
      ]
    },
    {
      "type": "listItem",
      "segments": [
        {
          "text": "displaying them within the Hachisu app (including the in-app Legal documents section);",
          "bold": false
        }
      ]
    },
    {
      "type": "listItem",
      "segments": [
        {
          "text": "posting them on a Hachisu website, where applicable; or",
          "bold": false
        }
      ]
    },
    {
      "type": "listItem",
      "segments": [
        {
          "text": "sending them to the email address associated with your account.",
          "bold": false
        }
      ]
    },
    {
      "type": "paragraph",
      "segments": [
        {
          "text": "A Communication is considered delivered when it is made available by any of these methods, whether or not you access it.",
          "bold": false
        }
      ]
    },
    {
      "type": "heading",
      "segments": [
        {
          "text": "4. Hardware and Software Requirements",
          "bold": false
        }
      ]
    },
    {
      "type": "paragraph",
      "segments": [
        {
          "text": "To receive and keep Communications, you need:",
          "bold": false
        }
      ]
    },
    {
      "type": "listItem",
      "segments": [
        {
          "text": "a mobile device capable of running the Hachisu app (a current iOS or Android device);",
          "bold": false
        }
      ]
    },
    {
      "type": "listItem",
      "segments": [
        {
          "text": "an internet connection;",
          "bold": false
        }
      ]
    },
    {
      "type": "listItem",
      "segments": [
        {
          "text": "a valid email address that you can access;",
          "bold": false
        }
      ]
    },
    {
      "type": "listItem",
      "segments": [
        {
          "text": "software capable of viewing standard document formats we use, such as web pages and CSV files (for exported reports); and",
          "bold": false
        }
      ]
    },
    {
      "type": "listItem",
      "segments": [
        {
          "text": "either storage on your device or a printer, if you want to keep copies.",
          "bold": false
        }
      ]
    },
    {
      "type": "paragraph",
      "segments": [
        {
          "text": "If we materially change these requirements in a way that creates a meaningful risk that you could no longer receive Communications, we will notify you and give you the chance to withdraw consent without charge.",
          "bold": false
        }
      ]
    },
    {
      "type": "heading",
      "segments": [
        {
          "text": "5. Keeping Your Email Address Current",
          "bold": false
        }
      ]
    },
    {
      "type": "paragraph",
      "segments": [
        {
          "text": "Your email address is our primary way to reach you outside the app, and it is also how you sign in. You agree to maintain a valid, working email address on your account and to update it promptly if it changes. You can view your email in the app's account section; to change the email associated with your account, contact us through the Contact form at https://hachisu.io/#contact.",
          "bold": false
        }
      ]
    },
    {
      "type": "heading",
      "segments": [
        {
          "text": "6. Requesting Copies",
          "bold": false
        }
      ]
    },
    {
      "type": "paragraph",
      "segments": [
        {
          "text": "You can view the current Terms of Service, Privacy Notice, and this Consent in the app at any time, and you can save or print copies from your device. You may also request an electronic copy of these documents by contacting us through the Contact form at https://hachisu.io/#contact.",
          "bold": false
        }
      ]
    },
    {
      "type": "paragraph",
      "segments": [
        {
          "text": "Paper copies:",
          "bold": true
        },
        {
          "text": " Hachisu is a digital service and does not currently offer paper delivery of Communications or maintain a paper-mail workflow. If we choose to provide a paper copy of a particular record on request in the future, we will tell you at that time whether a reasonable fee applies.",
          "bold": false
        }
      ]
    },
    {
      "type": "heading",
      "segments": [
        {
          "text": "7. Withdrawing Your Consent",
          "bold": false
        }
      ]
    },
    {
      "type": "paragraph",
      "segments": [
        {
          "text": "You may withdraw your consent to receive Communications electronically by contacting us through the Contact form at https://hachisu.io/#contact.",
          "bold": false
        }
      ]
    },
    {
      "type": "paragraph",
      "segments": [
        {
          "text": "Please note:",
          "bold": true
        },
        {
          "text": " electronic delivery is essential to how Hachisu works. Hachisu is an app-based service with no paper-based alternative, so if you withdraw this Consent we will be unable to continue providing the service to you, and your withdrawal will be treated as a request to close your account. Withdrawal does not affect the validity of Communications delivered, or agreements signed electronically, before the withdrawal took effect.",
          "bold": false
        }
      ]
    },
    {
      "type": "heading",
      "segments": [
        {
          "text": "8. Scope and Duration of This Consent",
          "bold": false
        }
      ]
    },
    {
      "type": "paragraph",
      "segments": [
        {
          "text": "This Consent applies to all Communications between you and Hachisu relating to your account and your use of the service, and it remains in effect until you withdraw it or your account is closed. It covers current and future Communications of the kinds described in Section 1.",
          "bold": false
        }
      ]
    },
    {
      "type": "heading",
      "segments": [
        {
          "text": "9. Applicable Law",
          "bold": false
        }
      ]
    },
    {
      "type": "paragraph",
      "segments": [
        {
          "text": "This Consent is provided in connection with laws that recognize electronic records and signatures, including the U.S. Electronic Signatures in Global and National Commerce Act (E-SIGN Act) and, where applicable, state laws such as the Uniform Electronic Transactions Act as adopted in your state. Nothing in this Consent waives any right you may have to receive a particular record on paper where the law requires paper delivery and does not permit electronic delivery.",
          "bold": false
        }
      ]
    },
    {
      "type": "heading",
      "segments": [
        {
          "text": "10. Contact",
          "bold": false
        }
      ]
    },
    {
      "type": "paragraph",
      "segments": [
        {
          "text": "Questions about this Consent, or requests described above: contact us through the Contact form at https://hachisu.io/#contact.",
          "bold": false
        }
      ]
    }
  ],
  "privacy-notice": [
    {
      "type": "title",
      "segments": [
        {
          "text": "Hachisu Privacy Notice",
          "bold": false
        }
      ]
    },
    {
      "type": "paragraph",
      "segments": [
        {
          "text": "Effective date:",
          "bold": true
        },
        {
          "text": " August 1, 2026",
          "bold": false
        }
      ]
    },
    {
      "type": "heading",
      "segments": [
        {
          "text": "1. Who We Are",
          "bold": false
        }
      ]
    },
    {
      "type": "paragraph",
      "segments": [
        {
          "text": "Hachisu is a mobile application (\"Hachisu,\" \"we,\" \"us,\" or \"our\") that helps merchants accept Bitcoin payments using their own Bitcoin wallets and payment infrastructure. You can contact us through the Contact form at https://hachisu.io/#contact.",
          "bold": false
        }
      ]
    },
    {
      "type": "heading",
      "segments": [
        {
          "text": "2. Scope of This Notice",
          "bold": false
        }
      ]
    },
    {
      "type": "paragraph",
      "segments": [
        {
          "text": "This Privacy Notice describes how we collect, use, share, and retain information when you use the Hachisu mobile application and the backend services that power it (together, the \"Service\"). It applies to merchants and other individuals who create Hachisu accounts.",
          "bold": false
        }
      ]
    },
    {
      "type": "paragraph",
      "segments": [
        {
          "text": "If you are a ",
          "bold": false
        },
        {
          "text": "customer of a Hachisu merchant",
          "bold": true
        },
        {
          "text": " (for example, you paid a Bitcoin invoice at a store that uses Hachisu), the merchant — not Hachisu — decides what information about you to enter into the Service. Hachisu processes that information to provide the Service to the merchant. Questions about a merchant's practices should be directed to that merchant.",
          "bold": false
        }
      ]
    },
    {
      "type": "heading",
      "segments": [
        {
          "text": "3. Hachisu Is Non-Custodial",
          "bold": false
        }
      ]
    },
    {
      "type": "paragraph",
      "segments": [
        {
          "text": "Hachisu is designed so that we never hold your money or your keys:",
          "bold": false
        }
      ]
    },
    {
      "type": "listItem",
      "segments": [
        {
          "text": "We do ",
          "bold": false
        },
        {
          "text": "not",
          "bold": true
        },
        {
          "text": " collect, store, or have access to private keys, seed phrases, or recovery phrases.",
          "bold": false
        }
      ]
    },
    {
      "type": "listItem",
      "segments": [
        {
          "text": "We do ",
          "bold": false
        },
        {
          "text": "not",
          "bold": true
        },
        {
          "text": " custody, hold, or control Bitcoin on your behalf. Bitcoin paid to you goes to wallets you control.",
          "bold": false
        }
      ]
    },
    {
      "type": "listItem",
      "segments": [
        {
          "text": "When you connect a Bitcoin wallet, you provide only ",
          "bold": false
        },
        {
          "text": "public",
          "bold": true
        },
        {
          "text": " wallet information — an extended public key (\"xpub\") or output descriptor — which can be used to generate receiving addresses and view related activity, but cannot be used to spend your Bitcoin.",
          "bold": false
        }
      ]
    },
    {
      "type": "heading",
      "segments": [
        {
          "text": "4. Information We Collect",
          "bold": false
        }
      ]
    },
    {
      "type": "heading",
      "segments": [
        {
          "text": "4.1 Account and authentication information",
          "bold": false
        }
      ]
    },
    {
      "type": "listItem",
      "segments": [
        {
          "text": "Email address.",
          "bold": true
        },
        {
          "text": " Used to create and sign in to your account. We use one-time email passcodes instead of passwords, so we do not collect or store a password.",
          "bold": false
        }
      ]
    },
    {
      "type": "listItem",
      "segments": [
        {
          "text": "Session information.",
          "bold": true
        },
        {
          "text": " Authentication tokens are stored locally on your device to keep you signed in.",
          "bold": false
        }
      ]
    },
    {
      "type": "heading",
      "segments": [
        {
          "text": "4.2 Profile information",
          "bold": false
        }
      ]
    },
    {
      "type": "paragraph",
      "segments": [
        {
          "text": "Depending on your account type, you may provide:",
          "bold": false
        }
      ]
    },
    {
      "type": "listItem",
      "segments": [
        {
          "text": "Personal profiles:",
          "bold": true
        },
        {
          "text": " name, phone number, country, mailing address, and a username.",
          "bold": false
        }
      ]
    },
    {
      "type": "listItem",
      "segments": [
        {
          "text": "Business profiles:",
          "bold": true
        },
        {
          "text": " business name, business address, business website (optional), business country, a description of the business, expected monthly payment volume, and a username.",
          "bold": false
        }
      ]
    },
    {
      "type": "paragraph",
      "segments": [
        {
          "text": "We do not collect Social Security numbers, dates of birth, EINs, or government ID documents.",
          "bold": false
        }
      ]
    },
    {
      "type": "heading",
      "segments": [
        {
          "text": "4.3 Merchant store and payment configuration",
          "bold": false
        }
      ]
    },
    {
      "type": "listItem",
      "segments": [
        {
          "text": "Store names, display names, default currency, and preferred exchange-rate source.",
          "bold": false
        }
      ]
    },
    {
      "type": "listItem",
      "segments": [
        {
          "text": "Identifiers linking your Hachisu store to the payment-processing infrastructure (BTCPay Server) that Hachisu provisions for it.",
          "bold": false
        }
      ]
    },
    {
      "type": "listItem",
      "segments": [
        {
          "text": "Point-of-sale (POS) app configuration, including product names, prices, and settings you define.",
          "bold": false
        }
      ]
    },
    {
      "type": "listItem",
      "segments": [
        {
          "text": "Pay Button configuration.",
          "bold": false
        }
      ]
    },
    {
      "type": "heading",
      "segments": [
        {
          "text": "4.4 Wallet-related public information",
          "bold": false
        }
      ]
    },
    {
      "type": "listItem",
      "segments": [
        {
          "text": "Extended public keys / output descriptors.",
          "bold": true
        },
        {
          "text": " When you connect a Bitcoin wallet, the public wallet information you provide is transmitted through our backend to the BTCPay Server payment infrastructure so it can generate receiving addresses for your store. We do ",
          "bold": false
        },
        {
          "text": "not",
          "bold": true
        },
        {
          "text": " persist the extended public key or descriptor itself in our application database. We store only:",
          "bold": false
        }
      ]
    },
    {
      "type": "listItem",
      "segments": [
        {
          "text": "a one-way cryptographic fingerprint (a SHA-256 hash) of the wallet scheme, used to detect whether a later wallet change refers to the same wallet;",
          "bold": false
        }
      ]
    },
    {
      "type": "listItem",
      "segments": [
        {
          "text": "non-sensitive metadata such as the address type (for example, native SegWit) and the date the wallet was connected.",
          "bold": false
        }
      ]
    },
    {
      "type": "listItem",
      "segments": [
        {
          "text": "Receiving addresses",
          "bold": true
        },
        {
          "text": " derived from your public wallet information may be shown to you in the app (for example, so you can confirm the wallet is the one you expect).",
          "bold": false
        }
      ]
    },
    {
      "type": "heading",
      "segments": [
        {
          "text": "4.5 Invoice, payment request, and transaction information",
          "bold": false
        }
      ]
    },
    {
      "type": "listItem",
      "segments": [
        {
          "text": "Invoices:",
          "bold": true
        },
        {
          "text": " amount, currency, description, order ID, an optional customer email address you enter, and the invoice's checkout link and status.",
          "bold": false
        }
      ]
    },
    {
      "type": "listItem",
      "segments": [
        {
          "text": "Payment requests:",
          "bold": true
        },
        {
          "text": " amount, currency, title, memo, reference ID, an optional recipient email address you enter, and related settings and links.",
          "bold": false
        }
      ]
    },
    {
      "type": "listItem",
      "segments": [
        {
          "text": "Payment activity:",
          "bold": true
        },
        {
          "text": " information about payments to your store retrieved from your store's payment infrastructure, such as invoice identifiers, amounts, payment method (for example, on-chain Bitcoin), Bitcoin addresses, transaction identifiers, statuses, and timestamps.",
          "bold": false
        }
      ]
    },
    {
      "type": "listItem",
      "segments": [
        {
          "text": "Balances and exchange rates:",
          "bold": true
        },
        {
          "text": " your store's on-chain wallet balance and exchange-rate information used to display approximate fiat values.",
          "bold": false
        }
      ]
    },
    {
      "type": "paragraph",
      "segments": [
        {
          "text": "If you enter information about your customers (such as a customer email address on an invoice), you are responsible for having the right to provide it to us.",
          "bold": false
        }
      ]
    },
    {
      "type": "heading",
      "segments": [
        {
          "text": "4.6 Technical and log information",
          "bold": false
        }
      ]
    },
    {
      "type": "paragraph",
      "segments": [
        {
          "text": "The Hachisu app does not include analytics, advertising, or tracking software development kits. However, like essentially all internet services:",
          "bold": false
        }
      ]
    },
    {
      "type": "listItem",
      "segments": [
        {
          "text": "Our infrastructure providers (described in Section 7) automatically generate server-side logs when your device communicates with our backend. These logs may include information such as IP address, request timestamps, and request metadata, and are used for security, debugging, and operating the Service.",
          "bold": false
        }
      ]
    },
    {
      "type": "listItem",
      "segments": [
        {
          "text": "Certain preferences (such as in-app notification preferences and your selected store) are stored locally on your device and are not transmitted to us.",
          "bold": false
        }
      ]
    },
    {
      "type": "heading",
      "segments": [
        {
          "text": "4.7 Communications and support",
          "bold": false
        }
      ]
    },
    {
      "type": "paragraph",
      "segments": [
        {
          "text": "If you contact us (for example, through our Contact form), we collect the information you choose to send, such as your email address and the contents of your message.",
          "bold": false
        }
      ]
    },
    {
      "type": "heading",
      "segments": [
        {
          "text": "5. How We Collect Information",
          "bold": false
        }
      ]
    },
    {
      "type": "listItem",
      "segments": [
        {
          "text": "Directly from you",
          "bold": true
        },
        {
          "text": " — when you create an account, complete onboarding, edit your profile, create stores, connect wallets, and create invoices, payment requests, or POS apps.",
          "bold": false
        }
      ]
    },
    {
      "type": "listItem",
      "segments": [
        {
          "text": "From your use of the Service",
          "bold": true
        },
        {
          "text": " — payment activity and balances retrieved from the payment infrastructure associated with your stores.",
          "bold": false
        }
      ]
    },
    {
      "type": "listItem",
      "segments": [
        {
          "text": "Automatically, at the infrastructure level",
          "bold": true
        },
        {
          "text": " — server logs generated by our service providers, as described above.",
          "bold": false
        }
      ]
    },
    {
      "type": "heading",
      "segments": [
        {
          "text": "6. How We Use Information",
          "bold": false
        }
      ]
    },
    {
      "type": "paragraph",
      "segments": [
        {
          "text": "We use the information described above to:",
          "bold": false
        }
      ]
    },
    {
      "type": "listItem",
      "segments": [
        {
          "text": "create and manage your account and verify sign-ins;",
          "bold": false
        }
      ]
    },
    {
      "type": "listItem",
      "segments": [
        {
          "text": "provision and manage your merchant stores and their payment-processing infrastructure;",
          "bold": false
        }
      ]
    },
    {
      "type": "listItem",
      "segments": [
        {
          "text": "connect and manage your Bitcoin wallet configuration using the public wallet information you provide;",
          "bold": false
        }
      ]
    },
    {
      "type": "listItem",
      "segments": [
        {
          "text": "create and manage invoices, payment requests, POS apps, and Pay Buttons;",
          "bold": false
        }
      ]
    },
    {
      "type": "listItem",
      "segments": [
        {
          "text": "display your payment activity, balances, and reports, including CSV exports you request;",
          "bold": false
        }
      ]
    },
    {
      "type": "listItem",
      "segments": [
        {
          "text": "respond to support requests;",
          "bold": false
        }
      ]
    },
    {
      "type": "listItem",
      "segments": [
        {
          "text": "secure the Service, prevent abuse, and debug problems; and",
          "bold": false
        }
      ]
    },
    {
      "type": "listItem",
      "segments": [
        {
          "text": "comply with applicable law.",
          "bold": false
        }
      ]
    },
    {
      "type": "paragraph",
      "segments": [
        {
          "text": "We do ",
          "bold": false
        },
        {
          "text": "not",
          "bold": true
        },
        {
          "text": " use your information for targeted advertising, and we do ",
          "bold": false
        },
        {
          "text": "not",
          "bold": true
        },
        {
          "text": " sell your personal information.",
          "bold": false
        }
      ]
    },
    {
      "type": "heading",
      "segments": [
        {
          "text": "7. How We Share Information",
          "bold": false
        }
      ]
    },
    {
      "type": "paragraph",
      "segments": [
        {
          "text": "We share information only as needed to run the Service:",
          "bold": false
        }
      ]
    },
    {
      "type": "listItem",
      "segments": [
        {
          "text": "Supabase",
          "bold": true
        },
        {
          "text": " — our backend platform. Supabase hosts our database, authentication (including delivery of one-time sign-in codes to your email), and server-side functions. Your account, profile, store, invoice, and payment-request records are stored on Supabase infrastructure.",
          "bold": false
        }
      ]
    },
    {
      "type": "listItem",
      "segments": [
        {
          "text": "BTCPay Server payment infrastructure",
          "bold": true
        },
        {
          "text": " — the payment-processing system your Hachisu store runs on. It receives your store configuration, your public wallet information (xpub/descriptor), invoice and payment-request details, and POS configuration, and it generates the checkout pages your customers use.",
          "bold": false
        }
      ]
    },
    {
      "type": "listItem",
      "segments": [
        {
          "text": "Exchange-rate sources",
          "bold": true
        },
        {
          "text": " — the payment infrastructure retrieves Bitcoin exchange rates from public rate providers (for example, Kraken) to price invoices and display fiat values. Your personal information is not sent to rate providers.",
          "bold": false
        }
      ]
    },
    {
      "type": "listItem",
      "segments": [
        {
          "text": "Apple and Google (app platforms)",
          "bold": true
        },
        {
          "text": " — the app is distributed through mobile app platforms, which have their own privacy practices governing app downloads and your device.",
          "bold": false
        }
      ]
    },
    {
      "type": "listItem",
      "segments": [
        {
          "text": "Professional advisers, authorities, and successors",
          "bold": true
        },
        {
          "text": " — we may share information when required by law, to protect our rights or users' safety, with professional advisers, or in connection with a merger, acquisition, or sale of assets (in which case this Notice will continue to apply to previously collected information until updated).",
          "bold": false
        }
      ]
    },
    {
      "type": "paragraph",
      "segments": [
        {
          "text": "We do not sell personal information, and we do not share it with data brokers or advertising networks.",
          "bold": false
        }
      ]
    },
    {
      "type": "heading",
      "segments": [
        {
          "text": "8. Bitcoin and Public Blockchains",
          "bold": false
        }
      ]
    },
    {
      "type": "paragraph",
      "segments": [
        {
          "text": "Bitcoin transactions are recorded on the public Bitcoin blockchain. This means:",
          "bold": false
        }
      ]
    },
    {
      "type": "listItem",
      "segments": [
        {
          "text": "Transaction details — including addresses, amounts, and transaction identifiers — are ",
          "bold": false
        },
        {
          "text": "publicly visible to anyone",
          "bold": true
        },
        {
          "text": " and are replicated across the Bitcoin network worldwide.",
          "bold": false
        }
      ]
    },
    {
      "type": "listItem",
      "segments": [
        {
          "text": "Blockchain records are designed to be permanent. ",
          "bold": false
        },
        {
          "text": "Hachisu cannot modify, delete, or conceal information recorded on the Bitcoin blockchain",
          "bold": true
        },
        {
          "text": ", including after you delete your Hachisu account.",
          "bold": false
        }
      ]
    },
    {
      "type": "listItem",
      "segments": [
        {
          "text": "Bitcoin addresses are pseudonymous, but they can sometimes be linked to identities through outside information. Be thoughtful about what you associate with your addresses.",
          "bold": false
        }
      ]
    },
    {
      "type": "heading",
      "segments": [
        {
          "text": "9. Data Retention",
          "bold": false
        }
      ]
    },
    {
      "type": "paragraph",
      "segments": [
        {
          "text": "We keep your account and related records while your account is active. Specifically:",
          "bold": false
        }
      ]
    },
    {
      "type": "listItem",
      "segments": [
        {
          "text": "Application records (profile, stores, invoices, payment requests, POS configuration, activity metadata) are retained until you delete your account.",
          "bold": false
        }
      ]
    },
    {
      "type": "listItem",
      "segments": [
        {
          "text": "Infrastructure-level logs and database backups maintained by our service providers are retained for limited periods according to those providers' practices.",
          "bold": false
        }
      ]
    },
    {
      "type": "listItem",
      "segments": [
        {
          "text": "We may retain limited records where reasonably necessary to comply with law, resolve disputes, enforce agreements, or protect the security of the Service.",
          "bold": false
        }
      ]
    },
    {
      "type": "heading",
      "segments": [
        {
          "text": "10. Account Deletion",
          "bold": false
        }
      ]
    },
    {
      "type": "paragraph",
      "segments": [
        {
          "text": "You can permanently delete your Hachisu account from within the app (Account → Close Account). When you delete your account:",
          "bold": false
        }
      ]
    },
    {
      "type": "listItem",
      "segments": [
        {
          "text": "Deleted:",
          "bold": true
        },
        {
          "text": " your account and application data — your authentication account, profile, merchant store records, POS app records, invoice and payment-request records, legal consent records, and related operational records — are permanently deleted. The payment-processing (BTCPay Server) stores that Hachisu provisioned for your account are also permanently deleted, including their apps and wallet configuration, and no new invoices or checkout pages can be created for them. If this payment-infrastructure cleanup cannot be completed, account deletion stops with an error so no records are left behind without an owner — you can retry.",
          "bold": false
        }
      ]
    },
    {
      "type": "listItem",
      "segments": [
        {
          "text": "May persist temporarily:",
          "bold": true
        },
        {
          "text": " copies in service-provider backups and server logs, which expire on those providers' schedules. The payment infrastructure also retains historical invoice records, so a previously issued invoice or checkout page may remain viewable after your account is deleted; an invoice still within its validity window at deletion remains payable — to your own wallet — until it expires.",
          "bold": false
        }
      ]
    },
    {
      "type": "listItem",
      "segments": [
        {
          "text": "Cannot be deleted:",
          "bold": true
        },
        {
          "text": " Bitcoin blockchain records, and any Bitcoin in your own wallets (which we never held in the first place — deleting your account does not affect your Bitcoin, but make sure you retain your own wallet backups and any exported reports you need before deleting).",
          "bold": false
        }
      ]
    },
    {
      "type": "heading",
      "segments": [
        {
          "text": "11. Security",
          "bold": false
        }
      ]
    },
    {
      "type": "paragraph",
      "segments": [
        {
          "text": "We take reasonable measures designed to protect your information, including:",
          "bold": false
        }
      ]
    },
    {
      "type": "listItem",
      "segments": [
        {
          "text": "database access rules that restrict each account's records to that account;",
          "bold": false
        }
      ]
    },
    {
      "type": "listItem",
      "segments": [
        {
          "text": "keeping payment-infrastructure API credentials on the server side only — they are never sent to or stored on your device;",
          "bold": false
        }
      ]
    },
    {
      "type": "listItem",
      "segments": [
        {
          "text": "never collecting private keys or seed phrases at all, which keeps the most sensitive wallet material entirely out of our systems; and",
          "bold": false
        }
      ]
    },
    {
      "type": "listItem",
      "segments": [
        {
          "text": "transmitting data between the app and our backend over encrypted (HTTPS) connections.",
          "bold": false
        }
      ]
    },
    {
      "type": "paragraph",
      "segments": [
        {
          "text": "No system is perfectly secure, and we cannot guarantee absolute security.",
          "bold": false
        }
      ]
    },
    {
      "type": "heading",
      "segments": [
        {
          "text": "12. Your Choices",
          "bold": false
        }
      ]
    },
    {
      "type": "listItem",
      "segments": [
        {
          "text": "Profile information.",
          "bold": true
        },
        {
          "text": " You can view and edit your profile and business information in the app.",
          "bold": false
        }
      ]
    },
    {
      "type": "listItem",
      "segments": [
        {
          "text": "Optional fields.",
          "bold": true
        },
        {
          "text": " Some fields (such as a customer email on an invoice) are optional — you decide whether to provide them.",
          "bold": false
        }
      ]
    },
    {
      "type": "listItem",
      "segments": [
        {
          "text": "Sign-in.",
          "bold": true
        },
        {
          "text": " We sign you in with your email address and a one-time code. We do not use passwords or third-party sign-in services.",
          "bold": false
        }
      ]
    },
    {
      "type": "listItem",
      "segments": [
        {
          "text": "In-app notification preferences.",
          "bold": true
        },
        {
          "text": " Stored only on your device.",
          "bold": false
        }
      ]
    },
    {
      "type": "listItem",
      "segments": [
        {
          "text": "Account deletion.",
          "bold": true
        },
        {
          "text": " Available in the app, as described in Section 10.",
          "bold": false
        }
      ]
    },
    {
      "type": "paragraph",
      "segments": [
        {
          "text": "The Hachisu app does not use advertising identifiers or cross-app tracking, so there is no advertising opt-out to manage.",
          "bold": false
        }
      ]
    },
    {
      "type": "heading",
      "segments": [
        {
          "text": "13. U.S. State Privacy Rights",
          "bold": false
        }
      ]
    },
    {
      "type": "paragraph",
      "segments": [
        {
          "text": "Depending on where you live, state privacy laws may give you rights over personal information, such as the right to access, correct, or delete it. Many of these laws apply only to businesses above certain size or revenue thresholds, and some exclude business-contact and business-to-business data; whether and how they apply to Hachisu has not yet been determined.",
          "bold": false
        }
      ]
    },
    {
      "type": "paragraph",
      "segments": [
        {
          "text": "Regardless of legal thresholds, you can always access and edit your profile in the app, delete your account as described above, or contact us through the Contact form at https://hachisu.io/#contact with privacy questions or requests. We do not sell personal information or use it for targeted advertising, so no \"do not sell or share\" opt-out is required to achieve that result.",
          "bold": false
        }
      ]
    },
    {
      "type": "heading",
      "segments": [
        {
          "text": "14. Children's Privacy",
          "bold": false
        }
      ]
    },
    {
      "type": "paragraph",
      "segments": [
        {
          "text": "The Service is intended for business use by adults. It is not directed to children, and we do not knowingly collect personal information from anyone under 18. If you believe a child has provided us personal information, contact us through the Contact form at https://hachisu.io/#contact and we will delete it.",
          "bold": false
        }
      ]
    },
    {
      "type": "heading",
      "segments": [
        {
          "text": "15. International Users",
          "bold": false
        }
      ]
    },
    {
      "type": "paragraph",
      "segments": [
        {
          "text": "The Service is operated from the United States and is intended for U.S.-based use during this stage of the product. If you use the Service from outside the United States, your information will be transferred to and processed in the United States (and in the regions where our service providers host data), where privacy laws may differ from those of your jurisdiction.",
          "bold": false
        }
      ]
    },
    {
      "type": "heading",
      "segments": [
        {
          "text": "16. Changes to This Notice",
          "bold": false
        }
      ]
    },
    {
      "type": "paragraph",
      "segments": [
        {
          "text": "We may update this Privacy Notice from time to time. If we make material changes, we will notify you through the app or by email and update the effective date above. Your continued use of the Service after an updated Notice takes effect means the updated Notice applies.",
          "bold": false
        }
      ]
    },
    {
      "type": "heading",
      "segments": [
        {
          "text": "17. Contact Us",
          "bold": false
        }
      ]
    },
    {
      "type": "paragraph",
      "segments": [
        {
          "text": "Questions or requests about this Privacy Notice or your information: contact us through the Contact form at https://hachisu.io/#contact.",
          "bold": false
        }
      ]
    }
  ]
};


/**
 * Unresolved placeholders still present in the rendered documents (e.g. legal
 * entity, addresses, governing law). Surfaced as a dev-mode warning in
 * constants/legal.ts so they cannot ship unnoticed; resolve them in
 * docs/legal/*.md before production.
 */
export const LEGAL_CONTENT_PLACEHOLDERS: readonly string[] = [
  "[ARBITRATION / DISPUTE RESOLUTION TO BE REVIEWED BY COUNSEL]",
  "[GOVERNING LAW STATE]"
];
