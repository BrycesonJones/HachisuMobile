// Client for the get-btcpay-pos-runtime Edge Function: resolves the
// authoritative BTCPay POS runtime URL for an OWNED POS app. The mobile app
// never constructs the BTCPay origin or public POS URL itself — the only URL
// it will open or encode in a QR is the one this resolver returns (and it is
// origin-checked server-side, then shape-checked again client-side before use).

import { isDevAuthActive } from '@/lib/auth/dev-session';
import { supabase } from '@/lib/supabase';
import type { PosMode } from '@/types/pos-app';

export type PosRuntimeErrorCode =
  | 'UNAUTHORIZED'
  | 'INVALID_REQUEST'
  | 'POS_APP_NOT_FOUND'
  | 'BTCPAY_APP_NOT_FOUND'
  | 'BTCPAY_REQUEST_FAILED'
  | 'INVALID_RUNTIME_URL'
  | 'POS_RUNTIME_UNAVAILABLE'
  | 'NETWORK_ERROR'
  | 'SERVER_ERROR';

export interface PosRuntime {
  posAppId: string;
  merchantStoreId: string;
  mode: PosMode;
  runtimeUrl: string;
  displayTitle: string;
  currency: string;
}

export type ResolvePosRuntimeResult =
  | { ok: true; runtime: PosRuntime }
  | { ok: false; code: PosRuntimeErrorCode; message: string };

interface RuntimeResponseBody {
  ok?: boolean;
  code?: PosRuntimeErrorCode;
  error?: string;
  posAppId?: unknown;
  merchantStoreId?: unknown;
  mode?: unknown;
  runtimeUrl?: unknown;
  displayTitle?: unknown;
  currency?: unknown;
}

async function readFunctionErrorBody(error: unknown): Promise<RuntimeResponseBody | null> {
  const ctx = (error as { context?: unknown })?.context;
  if (ctx && typeof (ctx as Response).json === 'function') {
    try {
      return (await (ctx as Response).clone().json()) as RuntimeResponseBody;
    } catch {
      // Body wasn't JSON or was already consumed.
    }
  }
  return null;
}

function toRuntime(body: RuntimeResponseBody): PosRuntime | null {
  if (
    typeof body.posAppId !== 'string' ||
    typeof body.merchantStoreId !== 'string' ||
    typeof body.runtimeUrl !== 'string' ||
    !body.runtimeUrl
  ) {
    return null;
  }
  return {
    posAppId: body.posAppId,
    merchantStoreId: body.merchantStoreId,
    mode: body.mode === 'quick-charge' ? 'quick-charge' : 'products',
    runtimeUrl: body.runtimeUrl,
    displayTitle: typeof body.displayTitle === 'string' ? body.displayTitle : '',
    currency: typeof body.currency === 'string' ? body.currency : '',
  };
}

const GENERIC_MESSAGE = 'Unable to open this point of sale. Try again.';

/**
 * Resolves the authoritative runtime URL for an owned POS app. Read-only; safe
 * to call repeatedly (the screen still guards duplicate taps for UX).
 */
export async function resolvePosRuntime(input: {
  merchantStoreId: string;
  posAppId: string;
}): Promise<ResolvePosRuntimeResult> {
  if (!input.merchantStoreId.trim() || !input.posAppId.trim()) {
    return { ok: false, code: 'INVALID_REQUEST', message: GENERIC_MESSAGE };
  }

  if (isDevAuthActive()) {
    // Dev bypass has no BTCPay to open.
    return {
      ok: false,
      code: 'POS_RUNTIME_UNAVAILABLE',
      message: 'Opening the point of sale is not available in developer mode.',
    };
  }

  let data: RuntimeResponseBody | null = null;
  let invokeError: unknown = null;
  try {
    const result = await supabase.functions.invoke<RuntimeResponseBody>(
      'get-btcpay-pos-runtime',
      {
        method: 'POST',
        body: { merchantStoreId: input.merchantStoreId, posAppId: input.posAppId },
      },
    );
    data = result.data;
    invokeError = result.error;
  } catch (err) {
    invokeError = err;
  }

  if (invokeError) {
    const body = await readFunctionErrorBody(invokeError);
    if (body?.code) {
      return { ok: false, code: body.code, message: body.error ?? GENERIC_MESSAGE };
    }
    return {
      ok: false,
      code: 'NETWORK_ERROR',
      message: 'Unable to reach the server. Check your connection and try again.',
    };
  }

  if (data?.ok) {
    const runtime = toRuntime(data);
    if (runtime) return { ok: true, runtime };
    return { ok: false, code: 'INVALID_RUNTIME_URL', message: GENERIC_MESSAGE };
  }
  return {
    ok: false,
    code: data?.code ?? 'SERVER_ERROR',
    message: data?.error ?? GENERIC_MESSAGE,
  };
}
