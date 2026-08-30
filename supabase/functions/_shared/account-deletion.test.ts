import { assertEquals } from 'jsr:@std/assert@1.0.19';

import { collectBtcpayStoreIds, unhandledBtcpayStoreIds } from './account-deletion.ts';

Deno.test('collects distinct store ids from rows and an attested profile id', () => {
  const ids = collectBtcpayStoreIds(
    [
      { btcpay_store_id: 'store-a' },
      { btcpay_store_id: 'store-b' },
      { btcpay_store_id: 'store-a' },
    ],
    'store-c',
    // 'store-c' survives only in the profile summary, but a server-written
    // provisioning event attests it, so it stays a deletion target.
    ['store-a', 'store-b', 'store-c'],
  );
  assertEquals(ids, ['store-a', 'store-b', 'store-c']);
});

Deno.test('profile id already covered by a row is not duplicated', () => {
  const ids = collectBtcpayStoreIds([{ btcpay_store_id: 'store-a' }], 'store-a');
  assertEquals(ids, ['store-a']);
});

Deno.test('drops null, blank, and whitespace ids', () => {
  const ids = collectBtcpayStoreIds(
    [{ btcpay_store_id: null }, { btcpay_store_id: '  ' }, { btcpay_store_id: ' store-a ' }],
    '',
  );
  assertEquals(ids, ['store-a']);
});

Deno.test('no stores yields an empty list', () => {
  assertEquals(collectBtcpayStoreIds([], null), []);
  assertEquals(collectBtcpayStoreIds([], undefined), []);
});

// ---------------------------------------------------------------------------
// A06 (Insecure Design) — CWE-642 / CWE-807 / CWE-501 regression.
//
// public.user_profiles is CLIENT-WRITABLE by design (RLS is row-scoped, so the
// owner may update their own row). Its BTCPay "default store summary" columns
// are therefore attacker-controlled values, not server facts.
//
// delete-account feeds user_profiles.btcpay_store_id straight into Greenfield
// DELETE /api/v1/stores/{id} using the server-wide BTCPay credential, which can
// see and delete EVERY merchant's store. An attacker who overwrites their own
// profile summary with ANOTHER merchant's BTCPay store id (published in that
// merchant's Pay Button HTML / POS links) and then closes their own account
// makes Hachisu destroy the victim's store — wallet configuration, POS apps and
// Pay Button included.
//
// The invariant: a store id only becomes a deletion target when a SERVER-OWNED
// record attests that it was provisioned for this user. The attestation set is
// built from btcpay_store_provisioning_events, which has no client write policy
// and no client write grant.
// ---------------------------------------------------------------------------

Deno.test('SECURITY: an unattested profile store id is never a deletion target', () => {
  const ids = collectBtcpayStoreIds(
    // Server-owned truth: this user owns exactly one BTCPay store.
    [{ btcpay_store_id: 'attacker-store' }],
    // Client-writable summary column, overwritten with a VICTIM's store id.
    'victim-store',
    // Server-owned attestation (provisioning events for THIS user).
    ['attacker-store'],
  );
  assertEquals(ids, ['attacker-store']);
});

Deno.test('a legacy profile-only store id IS deleted when the server attested it', () => {
  // The orphan-prevention case the profile column exists for: a store that
  // predates merchant_stores. It is attested, so it stays a deletion target.
  const ids = collectBtcpayStoreIds([], 'legacy-store', ['legacy-store']);
  assertEquals(ids, ['legacy-store']);
});

Deno.test('attestation never widens the set beyond this user own store rows', () => {
  // Attested ids are a FILTER for the profile column, not an extra source.
  const ids = collectBtcpayStoreIds(
    [{ btcpay_store_id: 'store-a' }],
    null,
    ['store-a', 'store-b', 'store-c'],
  );
  assertEquals(ids, ['store-a']);
});

// ---------------------------------------------------------------------------
// A06 (Insecure Design) — CWE-362 / CWE-841 regression.
//
// Deletion enumerates stores -> deletes them at BTCPay -> hard-deletes the user
// (all app tables cascade). A store created between the enumeration and the
// cascade is deleted from Supabase but left alive at BTCPay with no owner
// record: an orphaned merchant store holding invoice history, under a
// credential nobody can attribute. The workflow must re-check before the point
// of no return.
// ---------------------------------------------------------------------------

Deno.test('a store created during deletion is reported as still unhandled', () => {
  const pending = unhandledBtcpayStoreIds(
    ['store-a'],
    ['store-a', 'store-created-mid-deletion'],
  );
  assertEquals(pending, ['store-created-mid-deletion']);
});

Deno.test('a settled deletion pass reports nothing left to handle', () => {
  assertEquals(unhandledBtcpayStoreIds(['store-a', 'store-b'], ['store-b', 'store-a']), []);
  assertEquals(unhandledBtcpayStoreIds([], []), []);
});

Deno.test('unhandled ids are de-duplicated and blank-safe', () => {
  assertEquals(
    unhandledBtcpayStoreIds(['store-a'], [' store-a ', 'store-b', 'store-b', '  ']),
    ['store-b'],
  );
});
