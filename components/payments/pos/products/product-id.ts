/**
 * Local-only Product ID (slug) helpers for the POS product editor.
 *
 * Kept isolated so the generator/validator can be swapped for a backend slug
 * service later. No network or persistence here.
 */

/** Slugify a product title: lowercase, alphanumeric words joined by hyphens. */
export function generateProductIdFromTitle(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Slug-safe: lowercase letters, numbers, and single hyphens (no edges). */
export function isValidProductId(id: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id);
}
