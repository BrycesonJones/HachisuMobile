#!/usr/bin/env node
/**
 * Generates constants/legal-content.generated.ts from the canonical legal
 * Markdown in docs/legal/.
 *
 * docs/legal/*.md is the single source of truth for legal text. React Native
 * cannot import Markdown at runtime, so this script parses each document into
 * typed blocks the in-app renderer (components/legal/legal-document-view.tsx)
 * maps to native <Text> styles. Run it whenever a legal document changes:
 *
 *   npm run generate:legal
 *
 * and remember to bump the matching CURRENT_*_VERSION in constants/legal.ts
 * when the change is a new legal version.
 *
 * Internal drafting material is stripped for production rendering:
 *   - the "> **Draft for attorney review.** ..." blockquote banner
 *     (all blockquotes in these documents are that banner), and
 *   - inline "[NOTE FOR REVIEW: ...]" annotations.
 * Unresolved placeholders such as [LEGAL ENTITY NAME] are intentionally KEPT
 * (inventing values is worse than showing a placeholder); the script prints
 * every placeholder that remains user-visible so they are impossible to miss.
 */

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.join(__dirname, '..');
const SOURCE_DIR = path.join(REPO_ROOT, 'docs', 'legal');
const OUT_FILE = path.join(REPO_ROOT, 'constants', 'legal-content.generated.ts');

const DOCUMENTS = [
  { slug: 'terms-of-service', file: 'terms-of-service.md' },
  { slug: 'e-sign-consent', file: 'e-sign-consent.md' },
  { slug: 'privacy-notice', file: 'privacy-notice.md' },
];

/** Removes internal drafting material that must never render in production. */
function stripInternalAnnotations(markdown) {
  let text = markdown;
  // Blockquote banner lines ("> ..."). Every blockquote in these documents is
  // the internal draft-for-attorney-review banner.
  text = text
    .split('\n')
    .filter((line) => !/^\s*>/.test(line))
    .join('\n');
  // Inline attorney annotations, which may span multiple lines.
  text = text.replace(/\[NOTE FOR REVIEW:[\s\S]*?\]/g, '');
  return text;
}

/**
 * Splits a paragraph/list-item string into inline segments so the renderer can
 * style **bold** runs without a runtime Markdown parser.
 */
function parseInline(text) {
  const segments = [];
  const pattern = /\*\*([^*]+)\*\*/g;
  let lastIndex = 0;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ text: text.slice(lastIndex, match.index), bold: false });
    }
    segments.push({ text: match[1], bold: true });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    segments.push({ text: text.slice(lastIndex), bold: false });
  }
  return segments.filter((segment) => segment.text.length > 0);
}

/** Collapses a run of wrapped Markdown source lines into one paragraph string. */
function collapse(lines) {
  return lines
    .join(' ')
    .replace(/\s+/g, ' ')
    .replace(/\s+([.,;:!?)])/g, '$1')
    .trim();
}

/** Parses stripped Markdown into an array of typed blocks. */
function parseBlocks(markdown) {
  const blocks = [];
  const lines = markdown.split('\n');
  let paragraph = [];

  function flushParagraph() {
    if (paragraph.length === 0) return;
    const text = collapse(paragraph);
    paragraph = [];
    if (!text) return;
    blocks.push({ type: 'paragraph', segments: parseInline(text) });
  }

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const trimmed = line.trim();

    const heading = /^(#{1,3})\s+(.*)$/.exec(trimmed);
    if (heading) {
      flushParagraph();
      blocks.push({
        type: heading[1].length === 1 ? 'title' : 'heading',
        segments: parseInline(heading[2].trim()),
      });
      continue;
    }

    if (/^[-*]\s+/.test(trimmed)) {
      flushParagraph();
      // A list item may wrap onto following indented lines.
      const itemLines = [trimmed.replace(/^[-*]\s+/, '')];
      while (
        i + 1 < lines.length &&
        lines[i + 1].trim() !== '' &&
        !/^[-*]\s+/.test(lines[i + 1].trim()) &&
        !/^#{1,3}\s+/.test(lines[i + 1].trim()) &&
        /^\s{2,}/.test(lines[i + 1])
      ) {
        i += 1;
        itemLines.push(lines[i].trim());
      }
      const text = collapse(itemLines);
      if (text) blocks.push({ type: 'listItem', segments: parseInline(text) });
      continue;
    }

    if (trimmed === '') {
      flushParagraph();
      continue;
    }

    paragraph.push(trimmed);
  }

  flushParagraph();
  return blocks;
}

function blockText(block) {
  return block.segments.map((segment) => segment.text).join('');
}

function generate() {
  const generated = {};
  const visiblePlaceholders = new Set();

  for (const doc of DOCUMENTS) {
    const sourcePath = path.join(SOURCE_DIR, doc.file);
    const markdown = fs.readFileSync(sourcePath, 'utf8');
    const blocks = parseBlocks(stripInternalAnnotations(markdown));

    for (const block of blocks) {
      const matches = blockText(block).match(/\[[A-Z][A-Z0-9 /,'—–-]{3,}\]/g);
      for (const placeholder of matches ?? []) visiblePlaceholders.add(placeholder);
      if (/NOTE FOR REVIEW|Draft for attorney review/i.test(blockText(block))) {
        throw new Error(`Internal annotation leaked into ${doc.file}: ${blockText(block)}`);
      }
    }

    generated[doc.slug] = blocks;
  }

  const header = `/**
 * GENERATED FILE — DO NOT EDIT BY HAND.
 *
 * Source of truth: docs/legal/*.md. Regenerate with \`npm run generate:legal\`
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

export const LEGAL_CONTENT: Record<string, readonly LegalBlock[]> = `;

  const body = JSON.stringify(generated, null, 2);
  const placeholders = [...visiblePlaceholders].sort();
  const footer = `

/**
 * Unresolved placeholders still present in the rendered documents (e.g. legal
 * entity, addresses, governing law). Surfaced as a dev-mode warning in
 * constants/legal.ts so they cannot ship unnoticed; resolve them in
 * docs/legal/*.md before production.
 */
export const LEGAL_CONTENT_PLACEHOLDERS: readonly string[] = ${JSON.stringify(placeholders, null, 2)};
`;
  fs.writeFileSync(OUT_FILE, `${header}${body};\n${footer}`);

  console.log(`Wrote ${path.relative(REPO_ROOT, OUT_FILE)}`);
  if (visiblePlaceholders.size > 0) {
    console.log('User-visible placeholders (resolve before production):');
    for (const placeholder of [...visiblePlaceholders].sort()) {
      console.log(`  ${placeholder}`);
    }
  }
}

generate();
