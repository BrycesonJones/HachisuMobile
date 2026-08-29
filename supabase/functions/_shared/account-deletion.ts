// Helpers for the delete-account lifecycle.

/**
 * Collects the distinct BTCPay store ids that belong to the user being
 * deleted: every merchant_stores row plus the legacy user_profiles
 * "default store summary" id (normally one of the former, but included so a
 * store that only survives in the summary column can never be orphaned).
 * Blank/null ids are dropped; order follows first appearance.
 */
export function collectBtcpayStoreIds(
  storeRows: readonly { btcpay_store_id: string | null }[],
  profileStoreId: string | null | undefined,
): string[] {
  const ids = new Set<string>();
  for (const row of storeRows) {
    const id = row.btcpay_store_id?.trim();
    if (id) ids.add(id);
  }
  const profileId = profileStoreId?.trim();
  if (profileId) ids.add(profileId);
  return [...ids];
}
