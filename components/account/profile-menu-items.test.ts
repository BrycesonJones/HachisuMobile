// Account sheet menu regression tests: the Feedback row must sit above the
// profile row for BOTH account types, and the sheet/hub must stay wired to
// the shared builder and the /account/feedback route.
//
// Run: npm run test:app

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import { buildMenuItems } from './profile-menu-items.ts';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

test('Feedback appears above Personal Profile for personal accounts', () => {
  const items = buildMenuItems('personal');
  const feedbackIndex = items.findIndex((item) => item.id === 'feedback');
  const profileIndex = items.findIndex((item) => item.id === 'profile');
  assert.equal(feedbackIndex, 0, 'Feedback must be the first row');
  assert.ok(profileIndex > feedbackIndex, 'Feedback must sit above the profile row');
  assert.equal(items[feedbackIndex].label, 'Feedback');
  assert.equal(items[profileIndex].label, 'Personal Profile');
});

test('Feedback appears above Business Profile for business accounts', () => {
  const items = buildMenuItems('business');
  const feedbackIndex = items.findIndex((item) => item.id === 'feedback');
  const profileIndex = items.findIndex((item) => item.id === 'profile');
  assert.equal(feedbackIndex, 0, 'Feedback must be the first row');
  assert.ok(profileIndex > feedbackIndex, 'Feedback must sit above the profile row');
  assert.equal(items[profileIndex].label, 'Business Profile');
});

test('Feedback keeps the same position when account type is unresolved', () => {
  const items = buildMenuItems(null);
  assert.equal(items[0].id, 'feedback');
  assert.equal(items[1].id, 'profile');
});

test('the sheet renders rows from the shared builder (no local fork)', () => {
  const source = readFileSync(
    join(repoRoot, 'components/account/profile-menu-sheet.tsx'),
    'utf8',
  );
  assert.ok(
    source.includes("from '@/components/account/profile-menu-items'"),
    'profile-menu-sheet must import the shared menu items module',
  );
  assert.ok(
    source.includes('buildMenuItems(accountType)'),
    'profile-menu-sheet must build its rows via buildMenuItems',
  );
});

test('selecting Feedback routes to /account/feedback', () => {
  const source = readFileSync(
    join(repoRoot, 'components/account/account-profile-hub.tsx'),
    'utf8',
  );
  assert.ok(
    source.includes("case 'feedback':") && source.includes("'/account/feedback'"),
    'account-profile-hub resolveRoute must map the feedback row to /account/feedback',
  );
});
