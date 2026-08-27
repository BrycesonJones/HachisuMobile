import type { Tables } from '@/types/supabase';

/** A store-scoped Point of Sale app row (public.merchant_pos_apps). */
export type PosApp = Tables<'merchant_pos_apps'>;

/**
 * Merchant-facing POS modes. BTCPay terminology (Static/Cart/Light/Print) never
 * reaches the UI: 'products' is BTCPay's Cart view, 'quick-charge' is Light.
 */
export type PosMode = 'products' | 'quick-charge';

/**
 * Normalizes a stored pos_style into a Hachisu mode. Legacy 'product-list'
 * (Static) and any unrecognized value read as 'products' — never quick-charge,
 * which would silently change how the POS charges.
 */
export function posModeFromStyle(style: string): PosMode {
  return style === 'quick-charge' ? 'quick-charge' : 'products';
}

/** Merchant-facing label for a POS mode. */
export function posModeLabel(mode: PosMode): string {
  return mode === 'quick-charge' ? 'Quick Charge' : 'Products & Cart';
}
