import { isProfileDebugEnabled } from '@/lib/auth/config';
import { isDevAuthActive, updateDevProfile } from '@/lib/auth/dev-session';
import { addDevStore, getDevStores } from '@/lib/btcpay/dev-stores';
import { supabase } from '@/lib/supabase';
import type { MerchantStore } from '@/types/merchant-store';

export interface CreateMerchantStoreInput {
  name: string;
  defaultCurrency: string;
}

export interface CreateMerchantStoreResult {
  error: string | null;
}

// Dev-mode mirror of the backend syncUserStoreSummary: recompute the dev
// profile's summary fields from the in-memory dev store registry.
export function syncDevProfileSummary(): void {
  const all = getDevStores();
  const defaultStore = all.find((s) => s.is_default) ?? all[0] ?? null;
  const hasStores = all.length > 0;
  const hasDest = all.some((s) => s.wallet_status === 'payment_destination_connected');

  updateDevProfile({
    store_count: all.length,
    has_stores: hasStores,
    default_merchant_store_id: defaultStore?.id ?? null,
    btcpay_store_id: defaultStore?.btcpay_store_id ?? null,
    btcpay_store_name: defaultStore?.btcpay_store_name ?? defaultStore?.name ?? null,
    store_provisioning_status: hasStores ? 'active' : 'not_started',
    wallet_status: !hasStores
      ? 'not_connected'
      : hasDest
        ? 'payment_destination_connected'
        : 'store_created',
  });
}

/** Fetches the authenticated merchant's stores (default first, then oldest). */
export async function fetchMerchantStores(): Promise<MerchantStore[]> {
  if (isDevAuthActive()) {
    return getDevStores();
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('merchant_stores')
    .select('*')
    .eq('user_id', user.id)
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: true });

  if (error) throw new Error(error.message);
  return data ?? [];
}

/**
 * Creates a store via the create-btcpay-store Edge Function. The mobile app
 * never calls BTCPay directly. On success the caller should refetch the store
 * list (the function returns a normalized summary, not the full row).
 *
 * Dev-bypass mode simulates creation against the in-memory dev registry.
 */
export async function createMerchantStore(
  input: CreateMerchantStoreInput,
): Promise<CreateMerchantStoreResult> {
  const name = input.name.trim();
  const defaultCurrency = input.defaultCurrency.trim().toUpperCase();

  if (isDevAuthActive()) {
    const existing = getDevStores();
    const isDefault = existing.length === 0;
    const now = new Date().toISOString();
    const seq = existing.length + 1;

    addDevStore({
      id: `dev-store-${seq}`,
      user_id: 'dev-user-id',
      profile_id: 'dev-user-id',
      name,
      display_name: name,
      default_currency: defaultCurrency,
      preferred_price_source: 'kraken',
      btcpay_store_id: `dev-btcpay-${seq}`,
      btcpay_store_name: name,
      store_provisioning_status: 'active',
      wallet_status: 'store_created',
      lightning_status: 'not_connected',
      lightning_provider: null,
      onchain_status: 'not_connected',
      onchain_provider: null,
      onchain_address_type: null,
      onchain_wallet_configured_at: null,
      onchain_enabled: true,
      onchain_label: null,
      is_default: isDefault,
      created_at: now,
      updated_at: now,
    });

    // Recompute the dev profile summary from all dev stores (mirrors the
    // backend syncUserStoreSummary), so store_count updates for the 2nd+ store.
    syncDevProfileSummary();
    return { error: null };
  }

  const { data, error } = await supabase.functions.invoke<{ error?: string }>(
    'create-btcpay-store',
    { method: 'POST', body: { name, defaultCurrency } },
  );

  if (isProfileDebugEnabled) {
    console.log('[btcpay] create-store result', {
      ok: !error && !data?.error,
      error: error?.message,
      serverError: data?.error,
    });
  }

  if (error) return { error: error.message };
  if (data?.error) return { error: data.error };
  return { error: null };
}
