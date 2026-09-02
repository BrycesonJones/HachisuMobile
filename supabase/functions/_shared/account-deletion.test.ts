import { assertEquals } from 'jsr:@std/assert@1.0.19';

import {
  collectBtcpayStoreIds,
  confirmAccountDeleted,
  unhandledBtcpayStoreIds,
} from './account-deletion.ts';

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

// ---------------------------------------------------------------------------
// Post-deletion verification (OWASP A10:2025 — CWE-252 unchecked return value,
// CWE-636 not failing securely).
// ---------------------------------------------------------------------------
//
// delete-account answers ok:true only after reading the account back and finding
// it gone. That answer is a destructive instruction: on it the client drops the
// session and wipes the device's local copy of the merchant's data.
//
// The read-back was written as `const { data: after } = await
// admin.auth.admin.getUserById(id); if (after?.user) { fail }` — `error` was
// never destructured. supabase-js answers a FAILED admin call with
// `{ data: { user: null }, error }`, so a read-back that could not run produced
// exactly the same shape as a confirmed deletion, and the guard passed. The
// control inverted: not being able to check became the check.

Deno.test('a read-back showing no user confirms the deletion', () => {
  assertEquals(confirmAccountDeleted({ data: { user: null }, error: null }), {
    confirmed: true,
  });
});

Deno.test('a read-back that still finds the user does not confirm', () => {
  assertEquals(confirmAccountDeleted({ data: { user: { id: 'u1' } }, error: null }), {
    confirmed: false,
    reason: 'still_exists',
  });
});

Deno.test('a read-back that ITSELF failed does not confirm the deletion', () => {
  // The regression: this is byte-for-byte the shape of a successful deletion
  // except for `error`. Ignoring it reports a deletion nobody verified.
  assertEquals(
    confirmAccountDeleted({
      data: { user: null },
      error: { name: 'AuthApiError', message: 'service unavailable', status: 503 },
    }),
    { confirmed: false, reason: 'unverifiable' },
  );
});

Deno.test('a read-back error outranks an absent user', () => {
  // Fail-closed ordering: when both signals are present, the one that says
  // "this answer is not trustworthy" wins.
  assertEquals(
    confirmAccountDeleted({ data: null, error: new Error('network') }).confirmed,
    false,
  );
});

Deno.test('a user_not_found read-back IS the confirmation, not an inability to verify', () => {
  // Live incident 2026-09-02 (personal account close): admin.getUserById on a
  // just-deleted user answers { data: { user: null }, error: AuthApiError(404,
  // user_not_found) } — supabase-js reports "no such user" as an ERROR.
  // Treating every error as 'unverifiable' reported a completed deletion as
  // "Could not close your account" while the account was verifiably gone,
  // stranding the device with a session for a deleted identity. A
  // 404/user_not_found answer from the read-back is the positive proof of
  // absence this check exists to obtain — the same already-gone signal the
  // deleteUser step itself accepts.
  assertEquals(
    confirmAccountDeleted({
      data: { user: null },
      error: {
        name: 'AuthApiError',
        message: 'User not found',
        status: 404,
        code: 'user_not_found',
      },
    }),
    { confirmed: true },
  );

  // Either not-found signal alone suffices (mirrors the deleteUser check).
  assertEquals(
    confirmAccountDeleted({ data: { user: null }, error: { status: 404 } }),
    { confirmed: true },
  );
  assertEquals(
    confirmAccountDeleted({ data: { user: null }, error: { code: 'user_not_found' } }),
    { confirmed: true },
  );
});

Deno.test('a not-found error with a user still present stays unconfirmed', () => {
  // Contradictory answer — fail closed, never confirm on confusion.
  assertEquals(
    confirmAccountDeleted({
      data: { user: { id: 'u1' } },
      error: { status: 404, code: 'user_not_found' },
    }).confirmed,
    false,
  );
});

Deno.test('other read-back error statuses remain unverifiable', () => {
  // The not-found carve-out must not widen: a 500/403/network failure still
  // means nobody verified anything.
  for (const error of [
    { name: 'AuthApiError', message: 'service unavailable', status: 503 },
    { name: 'AuthApiError', message: 'forbidden', status: 403 },
    { status: 500, code: 'unexpected_failure' },
    new Error('network'),
  ]) {
    assertEquals(confirmAccountDeleted({ data: { user: null }, error }), {
      confirmed: false,
      reason: 'unverifiable',
    });
  }
});

Deno.test('a read-back with no data at all does not confirm silently', () => {
  // A malformed/absent payload is not evidence of deletion either — but with no
  // error to go on it is still the "gone" branch, so pin it explicitly rather
  // than leaving it to chance.
  assertEquals(confirmAccountDeleted({ data: null, error: null }), { confirmed: true });
});
