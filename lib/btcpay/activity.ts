import { isDevAuthActive } from '@/lib/auth/dev-session';
import { readFunctionError } from '@/lib/btcpay/function-error';
import { supabase } from '@/lib/supabase';
import type { StoreActivityEvent, StoreActivityResponse } from '@/types/activity';

export interface FetchStoreActivityOptions {
  /** Opaque cursor from a previous page. Omit for the first page. */
  cursor?: string | null;
  limit?: number;
  startDate?: string;
  endDate?: string;
}

export interface StoreActivityResult {
  items: StoreActivityEvent[];
  /** Cursor for the next page, or null when the store's history is exhausted. */
  nextCursor: string | null;
}

/**
 * Loads a page of BTCPay PAYMENT events for a merchant store via the
 * get-btcpay-store-activity Edge Function. The mobile app never calls BTCPay
 * directly and never sends a btcpay_store_id — the server resolves it from the
 * owned row. Dev-bypass mode returns an empty feed (no BTCPay in dev).
 *
 * Pagination is cursor-based and durable: there is no 30-day window and no
 * 25-item ceiling — the first page stays small for latency, and `nextCursor`
 * walks back through the store's entire history.
 */
export async function fetchStoreActivity(
  merchantStoreId: string,
  options: FetchStoreActivityOptions = {},
): Promise<StoreActivityResult> {
  if (isDevAuthActive()) {
    return { items: [], nextCursor: null };
  }

  const { data, error } = await supabase.functions.invoke<StoreActivityResponse>(
    'get-btcpay-store-activity',
    {
      method: 'POST',
      body: {
        merchantStoreId,
        cursor: options.cursor ?? undefined,
        limit: options.limit,
        startDate: options.startDate,
        endDate: options.endDate,
      },
    },
  );

  if (error) {
    throw new Error((await readFunctionError(error)) ?? error.message);
  }
  if (!data?.ok) {
    throw new Error(data?.error ?? 'Could not load activity.');
  }

  return {
    items: data.items ?? [],
    nextCursor: data.nextCursor ?? null,
  };
}
