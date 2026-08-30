// Recomputes the user_profiles "default store summary" from merchant_stores.
//
// merchant_stores is the source of truth for the full store list; user_profiles
// only caches a summary + the default store. Call this after any merchant_stores
// write. Idempotent and safe to run repeatedly.

import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2.112.4';

interface StoreRow {
  id: string;
  btcpay_store_id: string;
  btcpay_store_name: string | null;
  name: string;
  wallet_status: string;
  lightning_status: string;
  lightning_provider: string | null;
  onchain_status: string;
  onchain_provider: string | null;
  is_default: boolean;
  created_at: string;
}

export interface UserStoreSummary {
  store_count: number;
  has_stores: boolean;
  default_merchant_store_id: string | null;
  btcpay_store_id: string | null;
  btcpay_store_name: string | null;
  store_provisioning_status: 'not_started' | 'active';
  wallet_status: 'not_connected' | 'store_created' | 'payment_destination_connected';
  lightning_status: string;
  lightning_provider: string | null;
  onchain_status: string;
  onchain_provider: string | null;
}

export async function syncUserStoreSummary(
  admin: SupabaseClient,
  userId: string,
): Promise<UserStoreSummary> {
  const { data, error } = await admin
    .from('merchant_stores')
    .select(
      'id, btcpay_store_id, btcpay_store_name, name, wallet_status, lightning_status, ' +
        'lightning_provider, onchain_status, onchain_provider, is_default, created_at',
    )
    .eq('user_id', userId)
    .order('created_at', { ascending: true });

  if (error) throw new Error(`syncUserStoreSummary: ${error.message}`);

  // An untyped SupabaseClient infers this select as GenericStringError[], which
  // does not overlap StoreRow, so `deno check` rejects the direct assertion. The
  // shape is guaranteed by the column list above; go through unknown.
  const stores = (data ?? []) as unknown as StoreRow[];
  const storeCount = stores.length;
  const hasStores = storeCount > 0;

  // Determine the default store; if none is flagged but stores exist, promote
  // the oldest (stores are ordered by created_at asc).
  let defaultStore = stores.find((s) => s.is_default) ?? null;
  if (!defaultStore && hasStores) {
    defaultStore = stores[0];
    await admin
      .from('merchant_stores')
      .update({ is_default: true })
      .eq('id', defaultStore.id);
  }

  const hasPaymentDestination = stores.some(
    (s) => s.wallet_status === 'payment_destination_connected',
  );

  const summary: UserStoreSummary = {
    store_count: storeCount,
    has_stores: hasStores,
    default_merchant_store_id: defaultStore?.id ?? null,
    btcpay_store_id: defaultStore?.btcpay_store_id ?? null,
    btcpay_store_name: defaultStore?.btcpay_store_name ?? defaultStore?.name ?? null,
    store_provisioning_status: hasStores ? 'active' : 'not_started',
    wallet_status: !hasStores
      ? 'not_connected'
      : hasPaymentDestination
        ? 'payment_destination_connected'
        : 'store_created',
    lightning_status: defaultStore?.lightning_status ?? 'not_connected',
    lightning_provider: defaultStore?.lightning_provider ?? null,
    onchain_status: defaultStore?.onchain_status ?? 'not_connected',
    onchain_provider: defaultStore?.onchain_provider ?? null,
  };

  const { error: updateError } = await admin
    .from('user_profiles')
    .update(summary)
    .eq('id', userId);
  if (updateError) throw new Error(`syncUserStoreSummary update: ${updateError.message}`);

  return summary;
}
