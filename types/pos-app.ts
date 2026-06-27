import type { Tables } from '@/types/supabase';

/** A store-scoped Point of Sale app row (public.merchant_pos_apps). */
export type PosApp = Tables<'merchant_pos_apps'>;

/** Human label for a stored pos_style value. */
export function posStyleLabel(style: string): string {
  return style === 'product-list-cart' ? 'Product list with cart' : 'Product list';
}
