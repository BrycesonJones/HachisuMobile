/**
 * Local-only Pay Button Order ID generator.
 *
 * Format: `BTN-YYYYMMDD-XXXX`
 *   - `BTN`      — pay button prefix
 *   - `YYYYMMDD` — current local date
 *   - `XXXX`     — random 4-digit number
 *
 * Example: `BTN-20260621-4829`
 *
 * Frontend-only for now with no uniqueness guarantee. When real Pay Button
 * setup lands, the backend/Edge Function should validate or generate a
 * guaranteed-unique Order ID before calling BTCPay. Kept isolated so it's a
 * drop-in replacement target.
 */
export function generatePayButtonOrderId(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const suffix = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
  return `BTN-${yyyy}${mm}${dd}-${suffix}`;
}
