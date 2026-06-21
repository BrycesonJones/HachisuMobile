/**
 * Local-only invoice Order ID generator.
 *
 * Format: `HCH-YYYYMMDD-XXXX`
 *   - `HCH`      — Hachisu prefix
 *   - `YYYYMMDD` — current local date
 *   - `XXXX`     — random 4-digit number
 *
 * Example: `HCH-20260621-4829`
 *
 * This is frontend-only for now and makes no uniqueness guarantee. When real
 * invoice creation lands, the backend/Edge Function should validate or generate
 * a guaranteed-unique Order ID before sending the invoice to BTCPay. Keep this
 * function isolated so it's a drop-in replacement target.
 */
export function generateInvoiceOrderId(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const suffix = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
  return `HCH-${yyyy}${mm}${dd}-${suffix}`;
}
