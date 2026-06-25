import { isValidAmount } from '@/components/payments/invoices/create/validation';

export type ProductPriceType = 'fixed' | 'free' | 'any' | 'minimum';

/**
 * A POS product as held in local (in-memory) form/list state. Price and
 * inventory are kept as raw strings so they round-trip the form cleanly; no
 * backend shape is implied. No image fields — product images are out of scope
 * for MVP.
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

/** Short, customer-friendly price summary for product rows. */
export function formatPriceSummary(product: PosProduct): string {
  switch (product.priceType) {
    case 'free':
      return 'Free';
    case 'any':
      return 'Any amount';
    case 'minimum':
      return isValidAmount(product.price)
        ? `Min $${Number(product.price).toFixed(2)} ${product.currency}`
        : 'Minimum amount';
    case 'fixed':
    default:
      return isValidAmount(product.price)
        ? `$${Number(product.price).toFixed(2)} ${product.currency}`
        : 'No price set';
  }
}

// Real products are not fetched/persisted yet. Default to empty in production;
// drop sample rows here locally if you want to eyeball a populated list.
export const DEV_SAMPLE_PRODUCTS: readonly PosProduct[] = [];
