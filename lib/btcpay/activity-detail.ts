import { isDevAuthActive } from '@/lib/auth/dev-session';
import { supabase } from '@/lib/supabase';
import type {
  ActivityDetailErrorCode,
  ActivityDetailResponse,
  ActivityItem,
} from '@/types/activity';

/**
 * A classified failure from the durable activity-detail fetch. Carries a stable
 * `code` so the screen can render the right state (not-found vs. access-denied vs.
 * retryable) instead of collapsing every failure into one generic message.
 */
export class ActivityDetailError extends Error {
  readonly code: ActivityDetailErrorCode;
  readonly retryable: boolean;

  constructor(code: ActivityDetailErrorCode, message: string) {
    super(message);
    this.name = 'ActivityDetailError';
    this.code = code;
    this.retryable = RETRYABLE_CODES.has(code);
  }
}

/** Only transient/infrastructure failures are worth a Try Again button. */
const RETRYABLE_CODES = new Set<ActivityDetailErrorCode>([
  'BTCPAY_DETAIL_FETCH_FAILED',
  'BTCPAY_DETAIL_TIMEOUT',
]);

/** Reads `{ code, error }` from a non-2xx functions.invoke response body. */
async function readDetailError(
  error: unknown,
): Promise<{ code?: ActivityDetailErrorCode; message?: string }> {
  const context = (error as { context?: unknown })?.context;
  if (context && typeof (context as Response).json === 'function') {
    try {
      const body = await (context as Response).json();
      return {
        code: typeof body?.code === 'string' ? (body.code as ActivityDetailErrorCode) : undefined,
        message: typeof body?.error === 'string' ? body.error : undefined,
      };
    } catch {
      // Fall through — body wasn't JSON.
    }
  }
  return {};
}

/**
 * Fetches a single authoritative Activity record via get-btcpay-activity-detail.
 *
 * The request is bound to the ROUTE's merchantStoreId (never the globally active
 * store): the server verifies ownership, resolves btcpay_store_id, and scopes the
 * invoice lookup to it, so a mismatched store/invoice pair is rejected. The mobile
 * app never calls BTCPay directly and never sends a btcpay_store_id.
 *
 * Throws ActivityDetailError with a stable code on any failure. Dev-bypass has no
 * BTCPay, so any detail request resolves to INVOICE_NOT_FOUND.
 */
export async function fetchActivityDetail(
  merchantStoreId: string,
  invoiceId: string,
): Promise<ActivityItem> {
  if (isDevAuthActive()) {
    throw new ActivityDetailError('INVOICE_NOT_FOUND', 'Payment details are not available here.');
  }

  const { data, error } = await supabase.functions.invoke<ActivityDetailResponse>(
    'get-btcpay-activity-detail',
    {
      method: 'POST',
      body: { merchantStoreId, invoiceId },
    },
  );

  if (error) {
    const { code, message } = await readDetailError(error);
    throw new ActivityDetailError(
      code ?? 'BTCPAY_DETAIL_FETCH_FAILED',
      message ?? error.message ?? 'Payment details could not be loaded.',
    );
  }
  if (!data?.ok || !data.item) {
    throw new ActivityDetailError(
      data?.code ?? 'BTCPAY_DETAIL_FETCH_FAILED',
      data?.error ?? 'Payment details could not be loaded.',
    );
  }

  return data.item;
}
