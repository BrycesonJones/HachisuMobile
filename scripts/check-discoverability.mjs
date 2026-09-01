#!/usr/bin/env node
/**
 * Public agent-discoverability guard.
 *
 *   node scripts/check-discoverability.mjs
 *   node scripts/check-discoverability.mjs --root <dir>   # self-test
 *
 * The August 2026 discoverability audit found that no public Hachisu site
 * existed: hachisu.io answered a Porkbun parking page over HTTP with no TLS
 * certificate at all, hachisu.app served the same page, and hachisubitcoin.com
 * — the one domain with working HTTPS — 302'd to a Porkbun link-in-bio page
 * whose title, description, og:image and favicon all identified Porkbun. A live
 * AI fetch of a domain named "hachisu bitcoin" concluded it "represents Porkbun,
 * a domain registrar" and "does not mention Bitcoin, merchants, or payment
 * systems of any kind."
 *
 * The lesson encoded here is not "have a website". It is that the failure mode
 * that actually hurt was *reachable and wrong*, not merely absent. An
 * unreachable page yields uncertainty; a reachable page carrying someone else's
 * identity yields a confident falsehood that machines then repeat. Every rule
 * below therefore guards a way the published tree could re-acquire a wrong or
 * unreadable public identity.
 *
 *   1. A canonical landing page must exist and carry real text. A crawler that
 *      receives an empty shell, an image, or a bare slogan cannot answer "what
 *      is Hachisu" no matter how well the site is hosted.
 *
 *   2. No registrar identity may survive anywhere under web/. This is the exact
 *      defect the audit found: Porkbun's title, bio, logo and l.ink canonical
 *      URL served under a Hachisu domain name.
 *
 *   3. Identity metadata must point at https://hachisu.io and nowhere else. A
 *      canonical or og:url naming hachisu.app, hachisubitcoin.com, l.ink,
 *      localhost, a github.io preview, or any alternate host splits or
 *      misdirects the one signal that tells crawlers which domain IS Hachisu.
 *
 *   4. robots.txt must not blanket-block discovery crawlers and must declare the
 *      sitemap on the canonical host. Shipping `Disallow: /` — the default of
 *      many static templates — would silently undo the entire remediation.
 *
 *   5. sitemap.xml must be valid, canonical-host-only, and must not enumerate
 *      routes that require authentication. The audit's brief is explicit that
 *      private/app routes leaking into a sitemap is a real failure, not a
 *      cosmetic one.
 *
 *   6. Public copy must not represent Lightning as generally available while
 *      constants/feature-flags.ts gates it off, and the landing page must state
 *      that it is unavailable or coming soon. This is the rule with teeth: it
 *      ties marketing claims to the product's actual feature gate, so the site
 *      cannot drift into advertising something the app refuses to do.
 *
 *   7. Structured data must parse, must use a conservative type, and must not
 *      assert ratings, reviews, prices or download counts. Schema that outruns
 *      visible content is worse than no schema — it is machine-readable fiction.
 *
 *   8. Nothing under web/ may carry credentials or a source map. The public
 *      directory is served verbatim to anyone, crawler or not.
 *
 * These are guards, not a bug list: the tree is expected to pass.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, extname } from 'node:path';

const rootFlag = process.argv.indexOf('--root');
const ROOT = rootFlag !== -1 ? process.argv[rootFlag + 1] : process.cwd();

const CANONICAL_ORIGIN = 'https://hachisu.io';
const WEB = join(ROOT, 'web');

const failures = [];
const checks = [];
const fail = (rule, detail) => failures.push({ rule, detail });
const pass = (detail) => checks.push(detail);
const rel = (f) => relative(ROOT, f) || f;

const read = (f) => readFileSync(f, 'utf8');
const has = (f) => existsSync(f);

/** Every file under web/, recursively. */
function walk(dir) {
  if (!has(dir)) return [];
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

/** Strip tags/script/style so we test what a text extractor actually sees. */
function visibleText(html) {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const attr = (tag, name) => {
  const m = tag.match(new RegExp(`${name}\\s*=\\s*["']([^"']*)["']`, 'i'));
  return m ? m[1] : null;
};

/** <meta name=... content=...> / <meta property=... content=...> */
function meta(html, key) {
  const re = new RegExp(`<meta[^>]*(?:name|property)\\s*=\\s*["']${key}["'][^>]*>`, 'i');
  const m = html.match(re);
  return m ? attr(m[0], 'content') : null;
}

function canonicalOf(html) {
  const m = html.match(/<link[^>]*rel\s*=\s*["']canonical["'][^>]*>/i);
  return m ? attr(m[0], 'href') : null;
}

const htmlFiles = walk(WEB).filter((f) => extname(f) === '.html');

// ---------------------------------------------------------------------------
// 1. A canonical landing page exists and carries real, readable product text
// ---------------------------------------------------------------------------
const INDEX = join(WEB, 'index.html');

if (!has(INDEX)) {
  fail(
    'canonical-site-exists',
    `${rel(INDEX)} is missing. With no landing page, hachisu.io can only serve a parking ` +
      `page or a 404 — the state the discoverability audit failed on.`,
  );
} else {
  const html = read(INDEX);
  const text = visibleText(html);

  if (text.length < 400) {
    fail(
      'canonical-site-exists',
      `${rel(INDEX)}: only ${text.length} characters of text survive tag-stripping. A crawler ` +
        `that receives a shell, an image, or a slogan cannot determine what Hachisu is.`,
    );
  } else {
    pass('the canonical landing page exists and carries readable text');
  }

  // The five things an external system must be able to determine (audit §5).
  const required = [
    ['brand', /\bHachisu\b/i],
    ['bitcoin', /\bBitcoin\b/i],
    ['merchant audience', /\bmerchants?\b|\bbusinesse?s?\b/i],
    ['payment acceptance', /\baccept\b[\s\S]{0,40}\bpayments?\b|\bpayments?\b/i],
    ['non-custodial positioning', /\bnon-custodial\b/i],
  ];
  const missing = required.filter(([, re]) => !re.test(text)).map(([label]) => label);
  if (missing.length) {
    fail(
      'machine-readable-product',
      `${rel(INDEX)}: initial HTML text is missing ${missing.join(', ')}. These must appear as ` +
        `body text, not only in meta tags, or an extractor cannot answer what Hachisu is, who ` +
        `it is for, or whether it holds merchant funds.`,
    );
  } else {
    pass('brand, Bitcoin, merchant audience, payments and custody model appear in body text');
  }
}

// ---------------------------------------------------------------------------
// 2. No registrar/parking identity anywhere under web/
// ---------------------------------------------------------------------------
const REGISTRAR_MARKERS = [
  [/porkbun/i, 'Porkbun registrar branding'],
  [/\bl\.ink\b/i, 'l.ink link-in-bio host'],
  [/A Brand New Domain/i, 'Porkbun parked-domain headline'],
  [/Coming Soon\s*<\/(?:title|h1)>/i, 'parked-domain "Coming Soon" title'],
  [/pixie\.porkbun|uixie\.porkbun/i, 'Porkbun parking service host'],
];

const allWebFiles = walk(WEB);
if (allWebFiles.length === 0) {
  fail(
    'no-registrar-identity',
    `web/ does not exist, so the public identity is whatever the registrar serves. The audit ` +
      `found that to be Porkbun's, complete with og:image and favicon.`,
  );
} else {
  let dirty = false;
  for (const f of allWebFiles) {
    if (!/\.(html|txt|xml|json|webmanifest|css|js)$/i.test(f)) continue;
    const body = read(f);
    for (const [re, label] of REGISTRAR_MARKERS) {
      if (re.test(body)) {
        dirty = true;
        fail(
          'no-registrar-identity',
          `${rel(f)}: contains ${label}. No canonical Hachisu URL may present registrar identity.`,
        );
      }
    }
  }
  if (!dirty) pass('no Porkbun / l.ink / parked-domain identity survives under web/');
}

// ---------------------------------------------------------------------------
// 3. Identity metadata resolves to the canonical origin and nowhere else
// ---------------------------------------------------------------------------
const FOREIGN_HOSTS = [
  /hachisu\.app/i,
  /hachisubitcoin\.com/i,
  /\bl\.ink\b/i,
  /localhost|127\.0\.0\.1/i,
  /github\.io/i,
  /\.vercel\.app|\.netlify\.app|\.pages\.dev/i,
];

if (htmlFiles.length === 0) {
  fail('canonical-host', 'no HTML pages exist to carry a canonical identity.');
} else {
  let ok = true;
  for (const f of htmlFiles) {
    const html = read(f);

    // 404 pages are intentionally excluded from canonical/sitemap identity.
    const is404 = /404\.html$/.test(f);

    const canonical = canonicalOf(html);
    if (!canonical && !is404) {
      ok = false;
      fail('canonical-host', `${rel(f)}: no <link rel="canonical">. Duplicate hosts cannot be consolidated without one.`);
    } else if (canonical && !canonical.startsWith(CANONICAL_ORIGIN)) {
      ok = false;
      fail(
        'canonical-host',
        `${rel(f)}: canonical is "${canonical}" — it must be on ${CANONICAL_ORIGIN}.`,
      );
    }

    const ogUrl = meta(html, 'og:url');
    if (!ogUrl && !is404) {
      ok = false;
      fail('canonical-host', `${rel(f)}: no og:url. Link previews would resolve to whatever host served the page.`);
    } else if (ogUrl && !ogUrl.startsWith(CANONICAL_ORIGIN)) {
      ok = false;
      fail('canonical-host', `${rel(f)}: og:url is "${ogUrl}" — it must be on ${CANONICAL_ORIGIN}.`);
    }

    for (const target of [canonical, ogUrl].filter(Boolean)) {
      for (const bad of FOREIGN_HOSTS) {
        if (bad.test(target)) {
          ok = false;
          fail(
            'canonical-host',
            `${rel(f)}: identity URL "${target}" names an alternate/preview host. Alternate ` +
              `domains must redirect to the canonical origin, never claim identity themselves.`,
          );
        }
      }
    }
  }
  if (ok) pass(`every page asserts its identity on ${CANONICAL_ORIGIN}`);
}

// ---------------------------------------------------------------------------
// 4. Metadata a search/AI system needs to describe the product
// ---------------------------------------------------------------------------
if (has(INDEX)) {
  const html = read(INDEX);
  const titleMatch = html.match(/<title>([^<]*)<\/title>/i);
  const title = titleMatch ? titleMatch[1].trim() : null;
  const description = meta(html, 'description');

  if (!title) {
    fail('metadata-complete', `${rel(INDEX)}: no <title>.`);
  } else if (!/hachisu/i.test(title)) {
    fail(
      'metadata-complete',
      `${rel(INDEX)}: title "${title}" does not name the brand.`,
    );
  } else {
    pass(`title names the brand: "${title}"`);
  }

  if (!description) {
    fail('metadata-complete', `${rel(INDEX)}: no meta description.`);
  } else if (description.length < 50 || !/bitcoin/i.test(description)) {
    fail(
      'metadata-complete',
      `${rel(INDEX)}: meta description is too thin or omits Bitcoin ("${description}").`,
    );
  } else {
    pass('meta description identifies the product category');
  }

  for (const key of ['og:title', 'og:description', 'og:type', 'og:image']) {
    if (!meta(html, key)) fail('metadata-complete', `${rel(INDEX)}: missing ${key}.`);
  }
  if (!meta(html, 'twitter:card')) {
    fail('metadata-complete', `${rel(INDEX)}: missing twitter:card.`);
  }
  if (!/<html[^>]*\blang\s*=/i.test(html)) {
    fail('metadata-complete', `${rel(INDEX)}: <html> has no lang attribute.`);
  }
  if (
    meta(html, 'og:title') &&
    meta(html, 'og:description') &&
    meta(html, 'og:type') &&
    meta(html, 'og:image') &&
    meta(html, 'twitter:card') &&
    /<html[^>]*\blang\s*=/i.test(html)
  ) {
    pass('Open Graph, Twitter card and language declaration are present');
  }
}

// ---------------------------------------------------------------------------
// 5. robots.txt permits discovery and declares the canonical sitemap
// ---------------------------------------------------------------------------
const ROBOTS = join(WEB, 'robots.txt');
if (!has(ROBOTS)) {
  fail('robots-allows-discovery', `${rel(ROBOTS)} is missing.`);
} else {
  const body = read(ROBOTS);

  // A blanket Disallow: / under the wildcard agent blocks everything.
  const wildcard = body.split(/^user-agent:/im).find((b) => /^\s*\*/.test(b)) ?? '';
  if (/^\s*disallow:\s*\/\s*$/im.test(wildcard)) {
    fail(
      'robots-allows-discovery',
      `${rel(ROBOTS)}: "Disallow: /" under "User-agent: *" blocks every discovery crawler and ` +
        `would silently undo the entire remediation.`,
    );
  } else {
    pass('robots.txt does not blanket-block discovery crawlers');
  }

  const sitemapLine = body.match(/^sitemap:\s*(\S+)/im);
  if (!sitemapLine) {
    fail('robots-allows-discovery', `${rel(ROBOTS)}: no Sitemap: directive.`);
  } else if (!sitemapLine[1].startsWith(CANONICAL_ORIGIN)) {
    fail(
      'robots-allows-discovery',
      `${rel(ROBOTS)}: Sitemap points at "${sitemapLine[1]}", not ${CANONICAL_ORIGIN}.`,
    );
  } else {
    pass('robots.txt declares the sitemap on the canonical host');
  }
}

// ---------------------------------------------------------------------------
// 6. sitemap.xml is valid, canonical-only, and lists no authenticated route
// ---------------------------------------------------------------------------
const SITEMAP = join(WEB, 'sitemap.xml');
const PRIVATE_ROUTE = /\/(auth|account|payments|tabs|activity-details|transaction-details|modal)\b/i;

if (!has(SITEMAP)) {
  fail('sitemap-valid', `${rel(SITEMAP)} is missing.`);
} else {
  const xml = read(SITEMAP);

  if (!/^<\?xml/.test(xml.trim()) || !/<urlset[^>]*xmlns=/.test(xml)) {
    fail('sitemap-valid', `${rel(SITEMAP)}: not a well-formed urlset document.`);
  }

  const locs = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1]);
  if (locs.length === 0) {
    fail('sitemap-valid', `${rel(SITEMAP)}: contains no <loc> entries.`);
  } else {
    let ok = true;
    for (const loc of locs) {
      if (!loc.startsWith(`${CANONICAL_ORIGIN}/`) && loc !== CANONICAL_ORIGIN) {
        ok = false;
        fail('sitemap-valid', `${rel(SITEMAP)}: "${loc}" is not on ${CANONICAL_ORIGIN}.`);
      }
      if (PRIVATE_ROUTE.test(loc)) {
        ok = false;
        fail(
          'sitemap-valid',
          `${rel(SITEMAP)}: "${loc}" is an authenticated application route. Sitemaps enumerate ` +
            `public pages only.`,
        );
      }
      // Every listed page must actually exist in the published tree.
      const path = loc.slice(CANONICAL_ORIGIN.length).replace(/^\//, '').replace(/\/$/, '');
      const candidate = path === '' ? INDEX : join(WEB, `${path}.html`);
      const candidateDir = join(WEB, path, 'index.html');
      if (!has(candidate) && !has(candidateDir)) {
        ok = false;
        fail(
          'sitemap-valid',
          `${rel(SITEMAP)}: "${loc}" has no corresponding file under web/. A sitemap that lists ` +
            `pages the host cannot serve trains crawlers to distrust it.`,
        );
      }
    }
    if (ok) pass(`sitemap lists ${locs.length} canonical public URL(s), all served from web/`);
  }
}

// ---------------------------------------------------------------------------
// 7. Public copy must not outrun the Lightning feature gate
// ---------------------------------------------------------------------------
const FLAGS = join(ROOT, 'constants', 'feature-flags.ts');
if (!has(FLAGS)) {
  fail('lightning-not-advertised', `${rel(FLAGS)} is missing; cannot verify the Lightning gate.`);
} else {
  const gated = /LIGHTNING_ENABLED\s*=\s*false/.test(read(FLAGS));

  if (gated) {
    // Claims that would represent Lightning as a shipped, usable capability.
    const CLAIMS = [
      /\baccepts?\s+(?:Bitcoin\s+)?(?:and\s+)?Lightning\b/i,
      /\bLightning\s+(?:payments?|invoices?|支払)\s+(?:are\s+)?(?:supported|available|enabled)\b/i,
      /\bsupports?\s+Lightning\b/i,
      /\bLightning[- ]enabled\b/i,
      /\bwith\s+Lightning\s+support\b/i,
      /\bincluding\s+Lightning\b/i,
      /\bLightning\s+Network\s+payments?\b(?![^.]*\bnot\b)/i,
    ];
    let violated = false;
    for (const f of [...htmlFiles, join(WEB, 'llms.txt')].filter(has)) {
      const body = /\.html$/.test(f) ? visibleText(read(f)) : read(f);
      for (const re of CLAIMS) {
        if (re.test(body)) {
          violated = true;
          fail(
            'lightning-not-advertised',
            `${rel(f)}: represents Lightning as available (matched ${re}), but ` +
              `constants/feature-flags.ts has LIGHTNING_ENABLED = false. Public copy must not ` +
              `promise a surface the app gates off.`,
          );
        }
      }
    }

    const unavailableDisclosure =
      /\bLightning\b[\s\S]{0,48}\b(?:coming soon|not (?:currently )?available|unavailable|disabled)\b/i;
    const landingText = has(INDEX) ? visibleText(read(INDEX)) : '';
    if (!unavailableDisclosure.test(landingText)) {
      violated = true;
      fail(
        'lightning-not-advertised',
        `${rel(INDEX)}: does not clearly state that Lightning is unavailable or coming soon, ` +
          `but constants/feature-flags.ts has LIGHTNING_ENABLED = false. The landing page must ` +
          `make the gated status explicit.`,
      );
    }

    if (!violated) pass('public copy does not advertise Lightning while the product gate is off');
  } else {
    pass('LIGHTNING_ENABLED is true — Lightning copy is unconstrained by this guard');
  }
}

// ---------------------------------------------------------------------------
// 8. Structured data parses, stays conservative, and matches the canonical host
// ---------------------------------------------------------------------------
if (has(INDEX)) {
  const html = read(INDEX);
  const blocks = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];

  if (blocks.length === 0) {
    pass('no JSON-LD present (optional — nothing to validate)');
  } else {
    let ok = true;
    const ALLOWED = new Set(['Organization', 'SoftwareApplication', 'MobileApplication', 'WebSite', 'WebApplication']);
    const UNSUPPORTED = ['aggregateRating', 'review', 'ratingValue', 'downloadCount', 'offers'];

    for (const [, raw] of blocks) {
      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch (err) {
        ok = false;
        fail('structured-data-valid', `${rel(INDEX)}: JSON-LD does not parse — ${err.message}`);
        continue;
      }
      // A document may be a single node, an array, or a @graph container.
      const top = Array.isArray(parsed) ? parsed : [parsed];
      const nodes = top.flatMap((n) => (Array.isArray(n?.['@graph']) ? n['@graph'] : [n]));
      for (const node of nodes) {
        const type = node['@type'];
        const types = Array.isArray(type) ? type : [type];
        for (const t of types) {
          if (!ALLOWED.has(t)) {
            ok = false;
            fail(
              'structured-data-valid',
              `${rel(INDEX)}: JSON-LD @type "${t}" is outside the conservative set ` +
                `(${[...ALLOWED].join(', ')}).`,
            );
          }
        }
        const serialized = JSON.stringify(node);
        for (const claim of UNSUPPORTED) {
          if (new RegExp(`"${claim}"`).test(serialized)) {
            ok = false;
            fail(
              'structured-data-valid',
              `${rel(INDEX)}: JSON-LD asserts "${claim}". Ratings, reviews, prices and download ` +
                `counts are not supported by visible content and must not be fabricated.`,
            );
          }
        }
        if (node.url && !String(node.url).startsWith(CANONICAL_ORIGIN)) {
          ok = false;
          fail('structured-data-valid', `${rel(INDEX)}: JSON-LD url "${node.url}" is not canonical.`);
        }
      }
    }
    if (ok) pass('JSON-LD parses, uses a conservative type, and asserts no unsupported claims');
  }
}

// ---------------------------------------------------------------------------
// 9. llms.txt, when present, is canonical and factual
// ---------------------------------------------------------------------------
const LLMS = join(WEB, 'llms.txt');
if (has(LLMS)) {
  const body = read(LLMS);
  if (!body.includes(CANONICAL_ORIGIN)) {
    fail('llms-canonical', `${rel(LLMS)}: does not name ${CANONICAL_ORIGIN} as the canonical site.`);
  } else {
    pass('llms.txt names the canonical site');
  }
}

// ---------------------------------------------------------------------------
// 10. The published directory carries no credentials or source maps
// ---------------------------------------------------------------------------
if (allWebFiles.length > 0) {
  const SECRETS = [
    [/\bservice_role\b/i, 'Supabase service-role reference'],
    [/\bsb_secret_[A-Za-z0-9_-]+/, 'Supabase secret key'],
    [/\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\./, 'JWT-shaped credential'],
    [/BTCPAY_(?:API_)?KEY\s*[:=]/i, 'BTCPay Greenfield key'],
    [/GOCSPX-[A-Za-z0-9_-]+/, 'Google OAuth client secret'],
    [/\bxprv[0-9A-Za-z]{50,}/, 'extended private key'],
  ];
  let leaked = false;
  for (const f of allWebFiles) {
    const base = f.split('/').pop();
    if (base === '.env' || base.startsWith('.env.')) {
      leaked = true;
      fail('no-secrets-in-web', `${rel(f)}: environment file inside the published directory.`);
      continue;
    }
    if (/\.map$/.test(f)) {
      leaked = true;
      fail('no-secrets-in-web', `${rel(f)}: source map inside the published directory.`);
      continue;
    }
    if (!/\.(html|txt|xml|json|webmanifest|css|js)$/i.test(f)) continue;
    const body = read(f);
    for (const [re, label] of SECRETS) {
      if (re.test(body)) {
        leaked = true;
        fail('no-secrets-in-web', `${rel(f)}: contains a ${label}.`);
      }
    }
  }
  if (!leaked) pass('no credentials, environment files or source maps under web/');
}

// ---------------------------------------------------------------------------
// 11. The custom-domain file matches the canonical host
// ---------------------------------------------------------------------------
const CNAME = join(WEB, 'CNAME');
if (has(CNAME)) {
  const host = read(CNAME).trim();
  const expected = CANONICAL_ORIGIN.replace(/^https?:\/\//, '');
  if (host !== expected) {
    fail(
      'cname-matches-canonical',
      `${rel(CNAME)}: declares "${host}" but the canonical origin is ${CANONICAL_ORIGIN}. A ` +
        `mismatch serves the site on a host its own metadata disclaims.`,
    );
  } else {
    pass(`CNAME binds the published site to ${expected}`);
  }
}

// ---------------------------------------------------------------------------
// 12. A real 404 page exists (no soft-404)
// ---------------------------------------------------------------------------
if (allWebFiles.length > 0) {
  if (!has(join(WEB, '404.html'))) {
    fail(
      'real-404',
      `web/404.html is missing. Both parking services answered every unknown path with a 200, ` +
        `which indexes dead URLs as real pages.`,
    );
  } else {
    pass('a real 404 page is published');
  }
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------
if (failures.length === 0) {
  console.log('public discoverability OK');
  for (const c of checks) console.log(`  ✓ ${c}`);
  process.exit(0);
}
console.error(`public discoverability FAILED (${failures.length})`);
for (const f of failures) console.error(`  ✗ [${f.rule}] ${f.detail}`);
process.exit(1);
