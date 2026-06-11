import type { Tables } from '@/types/supabase';

/**
 * BTCPay store + payment-destination status model (Phase 1).
 *
 * The long-term model supports multiple payment destinations (Lightning:
 * strike / external node; on-chain: xpub / descriptor / external wallet), so the
 * status fields are kept independent of any single provider.
 */

export type StoreProvisioningStatus =
  | 'not_started'
  | 'provisioning'
  | 'active'
  | 'failed';

export type WalletStatus =
  | 'not_connected'
  | 'store_created'
  | 'payment_destination_connected'
  | 'error';

export type LightningStatus = 'not_connected' | 'connected' | 'error';
export type LightningProvider = 'strike' | 'external_node';

export type OnchainStatus = 'not_connected' | 'connected' | 'error';
export type OnchainProvider = 'xpub' | 'descriptor' | 'external_wallet';

/** Normalized status the app renders for the Wallet / Bitcoin Payment Setup UI. */
export interface WalletStoreStatus {
  storeProvisioningStatus: StoreProvisioningStatus;
  walletStatus: WalletStatus;
  lightningStatus: LightningStatus;
  onchainStatus: OnchainStatus;
  btcpayStoreId?: string;
  btcpayStoreName?: string;
}

type ProfileRow = Tables<'user_profiles'>;

/** Derives the normalized wallet/store status from a user_profiles row. */
export function walletStoreStatusFromProfile(
  profile: Pick<
    ProfileRow,
    | 'store_provisioning_status'
    | 'wallet_status'
    | 'lightning_status'
    | 'onchain_status'
    | 'btcpay_store_id'
    | 'btcpay_store_name'
  > | null,
): WalletStoreStatus {
  return {
    storeProvisioningStatus:
      (profile?.store_provisioning_status as StoreProvisioningStatus) ??
      'not_started',
    walletStatus: (profile?.wallet_status as WalletStatus) ?? 'not_connected',
    lightningStatus:
      (profile?.lightning_status as LightningStatus) ?? 'not_connected',
    onchainStatus: (profile?.onchain_status as OnchainStatus) ?? 'not_connected',
    btcpayStoreId: profile?.btcpay_store_id ?? undefined,
    btcpayStoreName: profile?.btcpay_store_name ?? undefined,
  };
}

/**
 * Tag shown next to the "Wallet" row in the profile menu sheet.
 * `hasBusinessProfile` is false when the merchant hasn't completed onboarding.
 */
export function walletMenuTag(
  status: WalletStoreStatus,
  hasBusinessProfile: boolean,
): string {
  if (!hasBusinessProfile) return 'Set up business';
  if (status.walletStatus === 'payment_destination_connected') return 'Connected';

  switch (status.storeProvisioningStatus) {
    case 'provisioning':
      return 'Creating store…';
    case 'failed':
      return 'Setup failed';
    case 'active':
      return 'Store ready';
    case 'not_started':
    default:
      return 'Set up store';
  }
}

/** Human label for the Store section in the Wallet setup screen. */
export function storeStatusLabel(status: WalletStoreStatus): string {
  switch (status.storeProvisioningStatus) {
    case 'provisioning':
      return 'Creating store…';
    case 'failed':
      return 'Setup failed';
    case 'active':
      return 'Store ready';
    case 'not_started':
    default:
      return 'Not set up';
  }
}
