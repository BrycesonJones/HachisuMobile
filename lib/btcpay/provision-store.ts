import { isProfileDebugEnabled } from '@/lib/auth/config';
import { isDevAuthActive, updateDevProfile } from '@/lib/auth/dev-session';
import { supabase } from '@/lib/supabase';
import type { WalletStoreStatus } from '@/types/wallet-store';

export interface ProvisionResult {
  status: WalletStoreStatus | null;
  alreadyProvisioned: boolean;
  error: string | null;
}

interface ProvisionResponseBody {
  status?: WalletStoreStatus;
  alreadyProvisioned?: boolean;
  error?: string;
}

/**
 * Invokes the `provision-btcpay-store` Edge Function for the authenticated user.
 *
 * The mobile client never talks to BTCPay directly — this only calls our backend,
 * which holds the Greenfield API key. The function is idempotent: calling it again
 * after a store exists returns the existing status without creating a duplicate.
 *
 * In dev-bypass mode there is no real Supabase session, so we simulate a
 * successful provisioning locally against the in-memory dev profile.
 */
export async function provisionBtcpayStore(): Promise<ProvisionResult> {
  if (isDevAuthActive()) {
    const profile = updateDevProfile({
      btcpay_store_id: 'dev-store-id',
      btcpay_store_name: 'Dev Merchant - Hachisu',
      store_provisioning_status: 'active',
      wallet_status: 'store_created',
      lightning_status: 'not_connected',
      onchain_status: 'not_connected',
    });

    return {
      status: {
        storeProvisioningStatus: 'active',
        walletStatus: 'store_created',
        lightningStatus: 'not_connected',
        onchainStatus: 'not_connected',
        btcpayStoreId: profile?.btcpay_store_id ?? 'dev-store-id',
        btcpayStoreName: profile?.btcpay_store_name ?? 'Dev Merchant - Hachisu',
      },
      alreadyProvisioned: false,
      error: null,
    };
  }

  const { data, error } = await supabase.functions.invoke<ProvisionResponseBody>(
    'provision-btcpay-store',
    { method: 'POST' },
  );

  if (isProfileDebugEnabled) {
    console.log('[btcpay] provision result', {
      hasData: data != null,
      error: error?.message,
      serverError: data?.error,
    });
  }

  if (error) {
    return { status: null, alreadyProvisioned: false, error: error.message };
  }
  if (data?.error) {
    return { status: null, alreadyProvisioned: false, error: data.error };
  }

  return {
    status: data?.status ?? null,
    alreadyProvisioned: data?.alreadyProvisioned ?? false,
    error: null,
  };
}
