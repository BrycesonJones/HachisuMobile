import { isDevAuthActive } from '@/lib/auth/dev-session';
import { supabase } from '@/lib/supabase';
import type {
  ActivityFeedEnrichment,
  ActivityItem,
  StoreActivityResponse,
} from '@/types/activity';

export interface FetchStoreActivityOptions {
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
}

export interface StoreActivityResult {
  items: ActivityItem[];
  enrichment: ActivityFeedEnrichment;
  nextOffset: number | null;
}

/** Default when a response predates enrichment metadata (or dev-bypass): treat as
 * nothing-to-enrich rather than fabricating a "complete" signal. */
const NOT_REQUIRED_ENRICHMENT: ActivityFeedEnrichment = {
  status: 'not_required',
  attemptedCount: 0,
  succeededCount: 0,
  failedCount: 0,
  retryableCount: 0,
};

/** Best-effort extraction of the server-side `{ error }` from a non-2xx
 * functions.invoke response (supabase-js otherwise gives a generic message). */
async function readFunctionError(error: unknown): Promise<string | undefined> {
  const context = (error as { context?: unknown })?.context;
  if (context && typeof (context as Response).json === 'function') {
    try {
      const body = await (context as Response).json();
      if (body && typeof body.error === 'string') return body.error;
    } catch {
      // Fall through to the generic message.
    }
  }
  return undefined;
}

/**
 * Loads BTCPay-derived Activity for a merchant store via the
 * get-btcpay-store-activity Edge Function. The mobile app never calls BTCPay
 * directly and never sends a btcpay_store_id — the server resolves it from the
 * owned row. Dev-bypass mode returns an empty feed (no BTCPay in dev).
 */
export async function fetchStoreActivity(
  merchantStoreId: string,
  options: FetchStoreActivityOptions = {},
): Promise<StoreActivityResult> {
  if (isDevAuthActive()) {
    return { items: [], enrichment: NOT_REQUIRED_ENRICHMENT, nextOffset: null };
  }

  const { data, error } = await supabase.functions.invoke<StoreActivityResponse>(
    'get-btcpay-store-activity',
    {
      method: 'POST',
      body: {
        merchantStoreId,
        startDate: options.startDate,
        endDate: options.endDate,
        limit: options.limit,
        offset: options.offset,
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
    enrichment: data.enrichment ?? NOT_REQUIRED_ENRICHMENT,
    nextOffset: data.nextOffset ?? null,
  };
}
