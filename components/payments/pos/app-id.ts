/**
 * Local-only Point of Sale app identifier generator.
 *
 * Format: `POS-YYYYMMDD-XXXX`
 *   - `POS`      — point of sale prefix
 *   - `YYYYMMDD` — current local date
 *   - `XXXX`     — random 4-digit number
 *
 * Example: `POS-20260624-4829`
 *
 * Frontend-only for now with no uniqueness guarantee. Kept internal for MVP
 * (not shown as a field). When real POS creation lands, the backend/Edge
 * Function should validate or generate a guaranteed-unique id before calling
 * BTCPay. Kept isolated so it's a drop-in replacement target.
 */
export function generatePosAppId(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const suffix = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
  return `POS-${yyyy}${mm}${dd}-${suffix}`;
}
