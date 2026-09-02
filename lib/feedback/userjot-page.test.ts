// UserJot feedback page regression tests.
//
// Hachisu is a payments app, so the security-sensitive contracts here are:
//  - only the canonical auth user ID (+ email when present) ever reaches
//    UserJot — no store/wallet/payment/profile metadata;
//  - user-controlled values (email) cannot break out of the inline script;
//  - the WebView navigation guard only admits Hachisu's base origin and
//    UserJot origins;
//  - the screen runs the WebView incognito so a later signed-in user cannot
//    inherit the previous user's UserJot identity.
//
// Run: npm run test:app

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import {
  buildUserJotFeedbackHtml,
  buildUserJotIdentity,
  isAllowedUserJotUrl,
  resolveTerminationRecovery,
  serializeForInlineScript,
  USERJOT_PAGE_BASE_URL,
  USERJOT_SDK_URL,
} from './userjot-page.ts';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

test('identity carries the canonical auth user ID and email only', () => {
  const identity = buildUserJotIdentity({
    id: 'auth-user-uuid',
    email: 'ada@example.com',
  });
  assert.deepEqual(identity, { id: 'auth-user-uuid', email: 'ada@example.com' });
});

test('email is omitted when unavailable rather than invented', () => {
  assert.deepEqual(buildUserJotIdentity({ id: 'auth-user-uuid', email: null }), {
    id: 'auth-user-uuid',
  });
  assert.deepEqual(buildUserJotIdentity({ id: 'auth-user-uuid' }), {
    id: 'auth-user-uuid',
  });
});

test('no user means no identity (anonymous widget), never a fabricated one', () => {
  assert.equal(buildUserJotIdentity(null), null);
  assert.equal(buildUserJotIdentity(undefined), null);
  assert.equal(buildUserJotIdentity({ id: null, email: 'ada@example.com' }), null);
});

test('sensitive merchant/payment/wallet fields never reach the identity or page', () => {
  // Simulate the worst case: a caller passes an entire user_profiles-shaped
  // row. Only id and email may survive the choke point.
  const leakyProfile = {
    id: 'auth-user-uuid',
    email: 'ada@example.com',
    btcpay_store_id: 'STORE-SECRET-ID',
    default_merchant_store_id: 'MERCHANT-STORE-ID',
    wallet_address: 'bc1qexampleaddress',
    phone: '+15551234567',
    business_name: 'Ada Coffee',
    access_token: 'SUPABASE-ACCESS-TOKEN',
  } as { id: string; email: string };

  const identity = buildUserJotIdentity(leakyProfile);
  assert.deepEqual(Object.keys(identity ?? {}).sort(), ['email', 'id']);

  const html = buildUserJotFeedbackHtml({
    projectId: 'proj_123',
    identity,
    backgroundColor: '#0B0B0F',
  });
  for (const secret of [
    'STORE-SECRET-ID',
    'MERCHANT-STORE-ID',
    'bc1qexampleaddress',
    '+15551234567',
    'Ada Coffee',
    'SUPABASE-ACCESS-TOKEN',
  ]) {
    assert.ok(!html.includes(secret), `page HTML must not contain ${secret}`);
  }
});

test('inline serialization neutralizes script-breaking characters', () => {
  const serialized = serializeForInlineScript({
    email: 'x</script><script>alert(1)</script>@example.com',
  });
  assert.ok(!serialized.includes('<'), 'no raw < may survive serialization');
  assert.ok(!serialized.includes('>'), 'no raw > may survive serialization');
  assert.ok(serialized.includes('\\u003c/script'), 'closing tags must be escaped');
  assert.ok(
    !serializeForInlineScript('a\u2028b\u2029c').match(/[\u2028\u2029]/),
    'line/paragraph separators must be escaped',
  );
});

test('the page initializes UserJot to the feedback experience without a launcher', () => {
  const html = buildUserJotFeedbackHtml({
    projectId: 'proj_123',
    identity: { id: 'auth-user-uuid', email: 'ada@example.com' },
    backgroundColor: '#0B0B0F',
  });
  assert.ok(html.includes(USERJOT_SDK_URL), 'must load the official v3 SDK');
  assert.ok(html.includes('"proj_123"'), 'must init with the project ID');
  assert.ok(html.includes('"launcher":false'), 'floating launcher must be disabled');
  assert.ok(html.includes('"pageContext":"none"'), 'must not share page context');
  assert.ok(html.includes('"to":"feedback"'), 'must open directly to feedback');
  assert.ok(html.includes('"auth-user-uuid"'), 'must identify with the auth user ID');
});

test('identify runs after SDK ready and reports failure without leaking identity', () => {
  // Live finding 2026-09-02: UserJot rejects unsigned identify() for
  // privileged workspace members (PRIVILEGED_MEMBER_REQUIRES_SIGNED_IDENTITY),
  // silently leaving the viewer anonymous — which disables commenting. The
  // page must observe the identify result and report failures to React
  // Native by error code only (never the identity payload), so this class of
  // problem is visible in logs instead of presenting as a dead comment box.
  const html = buildUserJotFeedbackHtml({
    projectId: 'proj_123',
    identity: { id: 'auth-user-uuid', email: 'ada@example.com' },
    backgroundColor: '#0B0B0F',
  });
  assert.ok(
    /uj\.on\('ready',[\s\S]*uj\.identify/.test(html),
    'identify must run inside the ready callback where its promise is observable',
  );
  assert.ok(html.includes('uj:identify-failed'), 'identify failure must reach the bridge');
  const failureBlock = html.slice(html.indexOf('uj:identify-failed') - 400, html.indexOf('uj:identify-failed') + 200);
  assert.ok(
    !failureBlock.includes('identity.email') && !failureBlock.includes('JSON.stringify(identity'),
    'the failure report must carry an error code only, never identity fields',
  );
});

test('the screen logs identify failure as non-fatal', () => {
  const source = readFileSync(join(repoRoot, 'app/account/feedback.tsx'), 'utf8');
  const start = source.indexOf("'uj:identify-failed'");
  assert.ok(start !== -1, 'the screen must handle the uj:identify-failed bridge message');
  const branch = source.slice(start, start + 400);
  assert.ok(branch.includes('console.warn'), 'identify failure must be logged');
  assert.ok(
    !branch.includes('setLoadState') && !branch.includes('leaveFeedback'),
    'identify failure must not tear down or navigate — feedback continues anonymously',
  );
});

test('identity is skipped entirely in the page when the user is unknown', () => {
  const html = buildUserJotFeedbackHtml({
    projectId: 'proj_123',
    identity: null,
    backgroundColor: '#0B0B0F',
  });
  assert.ok(html.includes('var identity = null'), 'anonymous page must carry no identity');
});

test('navigation guard admits only the base origin and UserJot origins', () => {
  assert.ok(isAllowedUserJotUrl(USERJOT_PAGE_BASE_URL));
  assert.ok(isAllowedUserJotUrl('about:blank'));
  assert.ok(isAllowedUserJotUrl('https://userjot.com/anything'));
  assert.ok(isAllowedUserJotUrl('https://cdn.userjot.com/sdk/v3/uj.js'));
  assert.ok(isAllowedUserJotUrl('https://hachisu.userjot.com/board'));

  assert.ok(!isAllowedUserJotUrl('https://evil.example.com/'));
  assert.ok(!isAllowedUserJotUrl('https://userjot.com.evil.example.com/'));
  assert.ok(!isAllowedUserJotUrl('https://notuserjot.com/'));
  assert.ok(!isAllowedUserJotUrl('http://userjot.com/'), 'plain HTTP must be blocked');
  // eslint-disable-next-line no-script-url
  assert.ok(!isAllowedUserJotUrl('javascript:alert(1)'));
  assert.ok(!isAllowedUserJotUrl('not a url'));
});

test('content-process termination recovery is bounded to one automatic reload', () => {
  // iOS can kill the WKWebView content process (memory pressure). Recover
  // silently once; a second death within the same visit must surface the
  // failure state instead of looping reloads forever.
  assert.equal(resolveTerminationRecovery(0), 'reload');
  assert.equal(resolveTerminationRecovery(1), 'fail');
  assert.equal(resolveTerminationRecovery(2), 'fail');
});

test('the feedback screen wires WebView process-termination recovery', () => {
  const source = readFileSync(join(repoRoot, 'app/account/feedback.tsx'), 'utf8');
  assert.ok(
    source.includes('onContentProcessDidTerminate'),
    'WebView must observe iOS content-process termination',
  );
  assert.ok(
    source.includes('resolveTerminationRecovery'),
    'termination handling must go through the bounded recovery helper',
  );
});

test('the WebView source identity depends only on the identity primitives', () => {
  // A Supabase token refresh swaps the session/user object identity. The
  // WebView source must be derived from the stable id/email primitives so an
  // auth refresh mid-typing can never rebuild the page under the keyboard.
  const source = readFileSync(join(repoRoot, 'app/account/feedback.tsx'), 'utf8');
  assert.ok(
    /\[\s*userId\s*,\s*userEmail\s*\]/.test(source),
    'the memoized source must key on userId/userEmail primitives, not the user object',
  );
});

test('the feedback screen isolates UserJot state per visit and guards navigation', () => {
  const source = readFileSync(join(repoRoot, 'app/account/feedback.tsx'), 'utf8');
  assert.ok(
    source.includes('incognito'),
    'WebView must run incognito so UserJot identity cannot persist across Hachisu sessions',
  );
  assert.ok(
    source.includes('onShouldStartLoadWithRequest') && source.includes('isAllowedUserJotUrl'),
    'WebView must gate navigation through isAllowedUserJotUrl',
  );
  assert.ok(
    source.includes('buildUserJotIdentity({ id: userId, email: userEmail })'),
    'identity must come from the auth user primitives via the buildUserJotIdentity choke point',
  );
  const lowered = source.toLowerCase();
  for (const forbidden of ['btcpay', 'wallet', 'invoice', 'store_id', 'access_token']) {
    assert.ok(
      !lowered.includes(forbidden),
      `screen must not touch ${forbidden} — feedback carries no merchant/payment data`,
    );
  }
});
