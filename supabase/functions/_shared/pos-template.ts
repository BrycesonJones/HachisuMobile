// Shared serializer: Hachisu's stored POS products -> BTCPay POS app template.
//
// Used by update-btcpay-pos-app (full save) and update-btcpay-pos-mode (mode
// auto-save). Greenfield's PUT /api/v1/apps/pos/{appId} is a FULL REPLACE
// (verified against v2.4.3: an omitted Template/Description is wiped to null),
// so every BTCPay update must carry the complete template — which is why this
// lives in _shared rather than in one function.

// Mobile price types -> BTCPay AppItem priceType (verified against BTCPay
// v2.4.3: the enum is Fixed | Topup | Minimum, and the desktop UI's "Custom"
// label is Topup). 'free' is a Fixed price of 0; BTCPay has no separate Free
// type. Products without a priceType predate the field and have always meant a
// plain fixed price, so they fall back to 'fixed' — never to 'any'/'free'.
const PRICE_TYPE_TO_BTCPAY: Record<string, string> = {
  fixed: 'Fixed',
  minimum: 'Minimum',
  any: 'Topup',
  free: 'Fixed',
};

const MAX_PRODUCTS = 250;

/** Plain positive decimal, max 2 fraction digits (all supported currencies). */
const PRICE_RE = /^\d+(\.\d{1,2})?$/;

/** A product the merchant must fix before the menu can be saved. */
export class PosProductError extends Error {}

/**
 * Serialize the product menu into BTCPay's POS app template (a JSON string of
 * AppItem objects). Fixed/Minimum items carry their price; Free items are
 * Fixed at 0; Topup ('any') items carry NO price — BTCPay ignores it and the
 * customer chooses the amount. A fixed/minimum product with a missing or
 * malformed price throws PosProductError: rejecting the save beats silently
 * pushing a different price to BTCPay.
 */
export function buildTemplate(products: unknown[]): string {
  const items = products
    .slice(0, MAX_PRODUCTS)
    .map((p) => {
      const prod = (p ?? {}) as Record<string, unknown>;
      const id = String(prod.productId ?? '');
      const title = String(prod.name ?? '');
      if (!id || !title) return null;
      const rawType = typeof prod.priceType === 'string' ? prod.priceType : 'fixed';
      const priceType = rawType in PRICE_TYPE_TO_BTCPAY ? rawType : 'fixed';
      const item: Record<string, unknown> = {
        id,
        title,
        priceType: PRICE_TYPE_TO_BTCPAY[priceType],
        disabled: prod.enabled === false,
      };
      if (priceType === 'fixed' || priceType === 'minimum') {
        const raw = typeof prod.price === 'string' ? prod.price.trim() : '';
        if (!PRICE_RE.test(raw) || Number(raw) <= 0) {
          throw new PosProductError(
            `"${title}" needs a valid price greater than 0 (up to 2 decimals).`,
          );
        }
        item.price = Number(raw);
      } else if (priceType === 'free') {
        item.price = 0;
      }
      if (typeof prod.description === 'string' && prod.description.trim()) {
        item.description = prod.description.trim();
      }
      if (typeof prod.category === 'string' && prod.category.trim()) {
        item.categories = [prod.category.trim()];
      }
      const inv = typeof prod.inventory === 'string' ? prod.inventory.trim() : '';
      if (inv && /^\d+$/.test(inv)) item.inventory = Number(inv);
      return item;
    })
    .filter((it): it is Record<string, unknown> => it !== null);

  return JSON.stringify(items);
}
