/**
 * POS product price semantics, mirroring BTCPay's item price types:
 * 'fixed' -> Fixed, 'minimum' -> Minimum, 'any' -> Topup (shown as "Custom"),
 * 'free' -> Fixed with price 0 (BTCPay has no separate Free type).
 */
export type ProductPriceType = 'fixed' | 'free' | 'any' | 'minimum';

const PRICE_TYPES: readonly ProductPriceType[] = ['fixed', 'free', 'any', 'minimum'];

/**
 * A POS product as held in form/list state and persisted to
 * merchant_pos_apps.products (JSONB). Price and inventory are kept as raw
 * strings so they round-trip the form cleanly; the update-btcpay-pos-app Edge
 * Function maps this shape onto the BTCPay POS template. No image fields —
 * product images are out of scope for MVP.
 */
export interface PosProduct {
  productId: string;
  name: string;
  priceType: ProductPriceType;
  /** Amount string; empty for 'free' / 'any'. */
  price: string;
  currency: string;
  enabled: boolean;
  description: string;
  category: string;
  /** Whole-number string; empty means untracked / unlimited. */
  inventory: string;
}

/** Price type needs an amount only for fixed and minimum. */
export function priceTypeNeedsAmount(priceType: ProductPriceType): boolean {
  return priceType === 'fixed' || priceType === 'minimum';
}

/**
 * Plain positive decimal with at most `decimals` fraction digits. Rejects the
 * exotic forms Number() would accept ("1e5", "0x10", "Infinity") so what the
 * merchant sees is exactly what BTCPay receives.
 */
export function isValidProductPrice(value: string, decimals = 2): boolean {
  const trimmed = value.trim();
  if (!new RegExp(`^\\d+(\\.\\d{1,${decimals}})?$`).test(trimmed)) return false;
  return Number(trimmed) > 0;
}

/** "1.00" -> "1", "1.80" -> "1.8" — matches how BTCPay lists item prices. */
function formatAmount(value: string): string {
  return String(Number(value.trim()));
}

/** Short, customer-friendly price summary for product rows. */
export function formatPriceSummary(product: PosProduct): string {
  switch (product.priceType) {
    case 'free':
      return 'Free';
    case 'any':
      return 'Any amount';
    case 'minimum':
      return isValidProductPrice(product.price)
        ? `${formatAmount(product.price)} ${product.currency} minimum`
        : 'Minimum amount';
    case 'fixed':
    default:
      return isValidProductPrice(product.price)
        ? `${formatAmount(product.price)} ${product.currency}`
        : 'No price set';
  }
}

/**
 * Normalizes one persisted product row into PosProduct form state. Rows saved
 * before priceType existed (or with an unrecognized value) load as 'fixed' —
 * a plain numeric price has always meant a fixed price here; never downgrade
 * unknowns to 'any'/'free', which would change what customers are charged.
 */
export function normalizePosProduct(raw: unknown): PosProduct | null {
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as Record<string, unknown>;
  const productId = typeof p.productId === 'string' ? p.productId : '';
  const name = typeof p.name === 'string' ? p.name : '';
  if (!productId || !name) return null;
  const priceType = PRICE_TYPES.includes(p.priceType as ProductPriceType)
    ? (p.priceType as ProductPriceType)
    : 'fixed';
  return {
    productId,
    name,
    priceType,
    price: typeof p.price === 'string' ? p.price : '',
    currency: typeof p.currency === 'string' ? p.currency : '',
    enabled: p.enabled !== false,
    description: typeof p.description === 'string' ? p.description : '',
    category: typeof p.category === 'string' ? p.category : '',
    inventory: typeof p.inventory === 'string' ? p.inventory : '',
  };
}

/** Normalizes the persisted products JSONB array (defensively) for the UI. */
export function normalizePosProducts(raw: unknown): PosProduct[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map(normalizePosProduct)
    .filter((p): p is PosProduct => p !== null);
}
