/** Local-only validators for the Create Invoice form. No network, no parsing
 * beyond shape checks — real validation happens server-side later. */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(value: string): boolean {
  return EMAIL_RE.test(value.trim());
}

/** Amount must parse to a finite number greater than zero. */
export function isValidAmount(value: string): boolean {
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) && parsed > 0;
}
