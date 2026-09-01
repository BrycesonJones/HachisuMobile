#!/usr/bin/env node
/**
 * Generates the PUBLIC legal pages (web/terms.html, web/privacy.html,
 * web/e-sign.html) from the canonical legal Markdown in docs/legal/.
 *
 * One legal policy set, multiple presentation surfaces: this script consumes
 * the SAME stripping/parsing pipeline the mobile app's generated content uses
 * (scripts/generate-legal-content.js), so the website and the app render the
 * same approved blocks and cannot drift apart in wording. Run it (via
 * `npm run generate:legal`) whenever a legal document changes; the pages are
 * committed build artifacts, and scripts/check-legal-integrity.mjs verifies
 * they stay byte-identical to a fresh regeneration.
 *
 * Purely presentational choices (page chrome, typography, meta tags) live
 * here; no legal text originates in this file.
 */

const fs = require('fs');
const path = require('path');

const {
  DOCUMENTS,
  SOURCE_DIR,
  stripInternalAnnotations,
  parseBlocks,
  blockText,
} = require('./generate-legal-content.js');

const REPO_ROOT = path.join(__dirname, '..');
const WEB_DIR = path.join(REPO_ROOT, 'web');
const CANONICAL_ORIGIN = 'https://hachisu.io';

/** slug in docs/legal → public route + page metadata */
const PAGES = {
  'terms-of-service': {
    route: 'terms',
    title: 'Hachisu Terms of Service',
    description: 'The Terms of Service governing use of the Hachisu application and services.',
  },
  'privacy-notice': {
    route: 'privacy',
    title: 'Hachisu Privacy Notice',
    description: 'How Hachisu collects, uses, shares, and protects information.',
  },
  'e-sign-consent': {
    route: 'e-sign',
    title: 'Hachisu E-Sign Disclosure',
    description: 'Hachisu’s Electronic Communications and E-Sign Consent disclosure.',
  },
};

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Purely presentational: a literal https:// URL in the canonical text becomes
 * a working link on the web (the app renders the same URL as text). Trailing
 * sentence punctuation stays outside the anchor.
 */
function linkifyEscaped(escaped) {
  return escaped.replace(
    /https:\/\/[^\s<]+?(?=[.,;:)]?(?:\s|$))/g,
    (url) => {
      // Canonical-origin URLs navigate same-site, so the link works wherever
      // the pages are served (local preview included), not only on the
      // deployed domain. The visible text keeps the canonical URL.
      const href = url.startsWith(CANONICAL_ORIGIN)
        ? url.slice(CANONICAL_ORIGIN.length) || '/'
        : url;
      return `<a href="${href}">${url}</a>`;
    },
  );
}

function renderSegments(segments) {
  return segments
    .map((s) => (s.bold ? `<strong>${escapeHtml(s.text)}</strong>` : linkifyEscaped(escapeHtml(s.text))))
    .join('');
}

/** Typed blocks → article HTML. Consecutive list items group into one list. */
function renderBlocks(blocks) {
  const out = [];
  let list = null;
  const flushList = () => {
    if (list) {
      out.push(`      <ul>\n${list.join('\n')}\n      </ul>`);
      list = null;
    }
  };
  for (const block of blocks) {
    if (block.type === 'listItem') {
      list = list ?? [];
      list.push(`        <li>${renderSegments(block.segments)}</li>`);
      continue;
    }
    flushList();
    if (block.type === 'title') out.push(`      <h1>${renderSegments(block.segments)}</h1>`);
    else if (block.type === 'heading') out.push(`      <h2>${renderSegments(block.segments)}</h2>`);
    else out.push(`      <p>${renderSegments(block.segments)}</p>`);
  }
  flushList();
  return out.join('\n');
}

/** The canonical Hachisu mark — same geometry as the landing-page header. */
const MARK_SVG = `<svg width="21" height="21" viewBox="0 0 48 48" fill="none" aria-hidden="true">
        <polygon points="24.00,3.60 41.67,13.80 41.67,34.20 24.00,44.40 6.33,34.20 6.33,13.80"
          stroke="currentColor" stroke-width="3.2" stroke-linejoin="round" fill="none"/>
        <polygon points="25.24,12.17 34.87,19.16 33.63,30.99 22.76,35.83 13.13,28.84 14.37,17.01"
          fill="currentColor" stroke="#FBFAF4" stroke-opacity="0.55" stroke-width="0.9" stroke-linejoin="round"/>
      </svg>`;

function pageHtml({ route, title, description }, article, siblings) {
  const crossNav = siblings
    .map((s) => (s.route === route
      ? `<span aria-current="page">${escapeHtml(s.short)}</span>`
      : `<a href="/${s.route}">${escapeHtml(s.short)}</a>`))
    .join('\n      <span class="sep">·</span>\n      ');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">

<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}">
<link rel="canonical" href="${CANONICAL_ORIGIN}/${route}">
<meta property="og:site_name" content="Hachisu">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:url" content="${CANONICAL_ORIGIN}/${route}">
<meta property="og:type" content="website">
<meta name="robots" content="index, follow">
<meta name="theme-color" content="#000000">
<meta name="color-scheme" content="dark">
<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">

<style>
  /* Tokens mirror the landing page (web/index.html). */
  :root {
    --ground: #000000;
    --line: #1A1A1A;
    --ink: #F2EDE3;
    --muted: #A0958A;
    --faint: #8A8076;
    --cream: #F1EBDD;
    --cream-2: #DED6C4;
    --orange: #F28C10;
    --orange-ink: #E9A445;
    --sans: -apple-system, BlinkMacSystemFont, "Segoe UI Variable Display", "Segoe UI",
            Inter, Roboto, "Helvetica Neue", Arial, sans-serif;
    --mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, "JetBrains Mono",
            "IBM Plex Mono", Consolas, monospace;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: var(--ground);
    color: var(--ink);
    font-family: var(--sans);
    font-size: 17px;
    line-height: 1.65;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }
  a { color: var(--orange-ink); text-decoration-color: rgba(233, 164, 69, 0.4); text-underline-offset: 3px; }
  a:hover { text-decoration-color: var(--orange-ink); }
  :focus-visible { outline: 2px solid var(--orange); outline-offset: 3px; border-radius: 2px; }

  header.site {
    position: sticky; top: 0; z-index: 10;
    background: rgba(0, 0, 0, 0.92);
  }
  @supports ((-webkit-backdrop-filter: blur(1px)) or (backdrop-filter: blur(1px))) {
    header.site {
      background: rgba(0, 0, 0, 0.72);
      -webkit-backdrop-filter: blur(18px);
              backdrop-filter: blur(18px);
    }
  }
  header.site .bar {
    max-width: 820px; margin: 0 auto;
    display: flex; align-items: center; gap: 20px;
    padding: 20px clamp(20px, 5vw, 32px) 18px;
    border-bottom: 1px solid var(--line);
  }
  .brand {
    display: inline-flex; align-items: center; gap: 10px;
    color: var(--ink); text-decoration: none;
    font-weight: 600; font-size: 18px; letter-spacing: -0.015em;
  }
  .brand svg { display: block; color: var(--cream); }
  .spacer { flex: 1 1 auto; }
  .back {
    font-family: var(--mono); font-size: 11px; letter-spacing: 0.14em;
    text-transform: uppercase; color: var(--faint); text-decoration: none;
  }
  .back:hover { color: var(--orange-ink); }

  main { max-width: 820px; margin: 0 auto; padding: clamp(36px, 6vw, 64px) clamp(20px, 5vw, 32px) 24px; }
  article { max-width: 70ch; }
  h1 {
    margin: 0 0 10px;
    font-size: clamp(30px, 5vw, 42px);
    line-height: 1.1;
    letter-spacing: -0.03em;
    font-weight: 600;
    color: var(--ink);
    text-wrap: balance;
  }
  h2 {
    margin: 2.2em 0 0.55em;
    font-size: clamp(20px, 2.6vw, 24px);
    line-height: 1.25;
    letter-spacing: -0.018em;
    font-weight: 600;
    color: var(--cream);
  }
  p { margin: 0 0 1em; color: var(--cream-2); }
  strong { color: var(--ink); font-weight: 600; }
  ul { margin: 0 0 1em; padding-left: 1.35em; color: var(--cream-2); }
  li { margin: 0 0 0.5em; }
  li::marker { color: var(--faint); }

  footer.site { border-top: 1px solid var(--line); margin-top: clamp(40px, 7vw, 72px); }
  footer.site .wrap {
    max-width: 820px; margin: 0 auto;
    display: flex; flex-wrap: wrap; gap: 10px 18px; align-items: center;
    padding: 24px clamp(20px, 5vw, 32px) 34px;
    font-family: var(--mono); font-size: 11px;
    letter-spacing: 0.13em; text-transform: uppercase; color: var(--faint);
  }
  footer.site a { color: var(--faint); text-decoration: none; }
  footer.site a:hover { color: var(--orange-ink); }
  footer.site [aria-current] { color: var(--cream-2); }
  footer.site .sep { color: var(--line); }
  footer.site .spacer { flex: 1 1 auto; }
</style>
</head>
<body>

<header class="site">
  <div class="bar">
    <a class="brand" href="/" aria-label="Hachisu home">
      ${MARK_SVG}
      Hachisu
    </a>
    <span class="spacer"></span>
    <a class="back" href="/">Back to hachisu.io</a>
  </div>
</header>

<main>
  <article>
${article}
  </article>
</main>

<footer class="site">
  <div class="wrap">
    <span>© 2026 Hachisu</span>
    <span class="spacer"></span>
    <nav aria-label="Legal documents" style="display:flex; gap:14px; align-items:center;">
      ${crossNav}
    </nav>
  </div>
</footer>

</body>
</html>
`;
}

function generatePages() {
  const siblings = [
    { route: 'terms', short: 'Terms' },
    { route: 'privacy', short: 'Privacy' },
    { route: 'e-sign', short: 'E-Sign' },
  ];
  for (const doc of DOCUMENTS) {
    const meta = PAGES[doc.slug];
    if (!meta) throw new Error(`no page mapping for ${doc.slug}`);
    const markdown = fs.readFileSync(path.join(SOURCE_DIR, doc.file), 'utf8');
    const blocks = parseBlocks(stripInternalAnnotations(markdown));
    for (const block of blocks) {
      if (/NOTE FOR REVIEW|Draft for attorney review/i.test(blockText(block))) {
        throw new Error(`Internal annotation leaked into ${doc.file}`);
      }
    }
    const outPath = path.join(WEB_DIR, `${meta.route}.html`);
    fs.writeFileSync(outPath, pageHtml(meta, renderBlocks(blocks), siblings));
    console.log(`Wrote web/${meta.route}.html (${blocks.length} blocks)`);
  }
}

if (require.main === module) {
  generatePages();
}

module.exports = { PAGES, generatePages };
