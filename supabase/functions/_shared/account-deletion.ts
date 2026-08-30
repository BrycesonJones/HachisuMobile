// Helpers for the delete-account lifecycle.

/**
 * Collects the distinct BTCPay store ids that belong to the user being deleted.
 *
 * Two sources, with very different trust levels:
 *
 *   1. `storeRows` — the user's own public.merchant_stores rows. SERVER-OWNED:
 *      the client has no INSERT/UPDATE/DELETE policy or grant on that table
 *      (20260829120000_lock_down_client_write_policies), so these ids are facts.
 *
 *   2. `profileStoreId` — public.user_profiles.btcpay_store_id, the legacy
 *      "default store summary". user_profiles is deliberately client-writable
 *      (the profile hub edits it), and RLS is row-scoped, not column-scoped, so
 *      this value is ATTACKER-CONTROLLED. It is included only so a legacy store
 *      that survives nowhere else can never be orphaned — never because the
 *      client said so.
 *
 * Every id fed to Greenfield DELETE /api/v1/stores/{id} is destructive and runs
 * under a server-wide BTCPay credential that can see every merchant's store, so
 * the profile-supplied id is admitted ONLY when `attestedStoreIds` corroborates
 * it. That set comes from public.btcpay_store_provisioning_events rows for this
 * user — a table with a select-own policy and no client write path at all — so
 * an id the server never provisioned for this user can never become a deletion
 * target. Attestation is a FILTER, never an additional source: an attested id
 * with neither a store row nor the profile column behind it is not returned.
 *
 * Blank/null ids are dropped; order follows first appearance.
 */
export function collectBtcpayStoreIds(
  storeRows: readonly { btcpay_store_id: string | null }[],
  profileStoreId: string | null | undefined,
  attestedStoreIds: readonly string[] = [],
): string[] {
  const ids = new Set<string>();
  for (const row of storeRows) {
    const id = row.btcpay_store_id?.trim();
    if (id) ids.add(id);
  }

  const profileId = profileStoreId?.trim();
  if (profileId && !ids.has(profileId)) {
    const attested = new Set(
      attestedStoreIds.map((id) => id?.trim()).filter((id): id is string => !!id),
    );
    if (attested.has(profileId)) ids.add(profileId);
  }

  return [...ids];
}

/**
 * The BTCPay store ids that appeared AFTER a deletion pass already ran.
 *
 * Account deletion enumerates stores, deletes them at BTCPay, and only then
 * hard-deletes the Supabase user (every app table cascades). A store created
 * concurrently — the same account calling create-btcpay-store from a second
 * device while deletion is in flight — lands after the enumeration and is then
 * cascaded away with the user, leaving a live BTCPay store with no owner record
 * anywhere: exactly the orphan the ordering exists to prevent.
 *
 * `handled` is what the current pass already deleted; `current` is a fresh read.
 * A non-empty result means another pass is required before the account may go.
 */
export function unhandledBtcpayStoreIds(
  handled: readonly string[],
  current: readonly string[],
): string[] {
  const done = new Set(handled.map((id) => id?.trim()).filter((id): id is string => !!id));
  const pending: string[] = [];
  for (const raw of current) {
    const id = raw?.trim();
    if (id && !done.has(id) && !pending.includes(id)) pending.push(id);
  }
  return pending;
}
