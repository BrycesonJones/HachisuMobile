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

// Server-side bounds on every free-form product field. The products array
// arrives verbatim from the untrusted mobile client, and these strings are
// forwarded to consumers that expect bounded identifiers/labels: BTCPay's POS
// AppItem template (rendered on the store's PUBLIC point-of-sale page) and the
// CSV export, where a cart item's `id` becomes a report COLUMN NAME. The client
// caps description at 300 for UX; that is an affordance, not a boundary, so the
// same limit is enforced here. Over-length input is REJECTED rather than
// truncated — silently shortening a menu item would show the merchant one thing
// and the customer another.
const MAX_PRODUCT_ID_LENGTH = 100;
const MAX_PRODUCT_TITLE_LENGTH = 200;
const MAX_PRODUCT_DESCRIPTION_LENGTH = 300;
const MAX_PRODUCT_CATEGORY_LENGTH = 100;

/** Plain positive decimal, max 2 fraction digits (all supported currencies). */
const PRICE_RE = /^\d+(\.\d{1,2})?$/;

/** A product the merchant must fix before the menu can be saved. */
export class PosProductError extends Error {}

/** Rejects an over-long free-form product field. */
function assertLength(value: string, maxLength: number, label: string, title: string): void {
  if (value.length > maxLength) {
    throw new PosProductError(
      `"${title}": ${label} must be ${maxLength} characters or fewer.`,
    );
  }
}

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
      assertLength(title, MAX_PRODUCT_TITLE_LENGTH, 'the name', title.slice(0, 40));
      assertLength(id, MAX_PRODUCT_ID_LENGTH, 'the product id', title);
      const rawType = typeof prod.priceType === 'string' ? prod.priceType : 'fixed';
      // OWN-key lookup, never `in`. PRICE_TYPE_TO_BTCPAY is an object literal, so
      // `in` answers true for every Object.prototype member ('toString',
      // 'constructor', '__proto__', ...). A client sending one of those as
      // priceType would walk past this allow-list and emit an AppItem whose
      // priceType resolved to an inherited function/object — dropped by
      // JSON.stringify — leaving BTCPay a public checkout item with NO price type
      // and NO price. An unrecognized value must always mean 'fixed'.
      const priceType = Object.hasOwn(PRICE_TYPE_TO_BTCPAY, rawType) ? rawType : 'fixed';
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
        const description = prod.description.trim();
        assertLength(description, MAX_PRODUCT_DESCRIPTION_LENGTH, 'the description', title);
        item.description = description;
      }
      if (typeof prod.category === 'string' && prod.category.trim()) {
        const category = prod.category.trim();
        assertLength(category, MAX_PRODUCT_CATEGORY_LENGTH, 'the category', title);
        item.categories = [category];
      }
      const inv = typeof prod.inventory === 'string' ? prod.inventory.trim() : '';
      if (inv && /^\d+$/.test(inv)) item.inventory = Number(inv);
      return item;
    })
    .filter((it): it is Record<string, unknown> => it !== null);

  return JSON.stringify(items);
}
