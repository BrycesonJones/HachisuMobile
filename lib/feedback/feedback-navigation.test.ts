// Regression tests for leaving the Feedback screen.
//
// Live defect 2026-09-02: both the native header back and the UserJot
// `uj:close` bridge called router.back() unconditionally. When the Feedback
// route is the first route in the stack (cold deep link, dev reload), that
// dispatches a GO_BACK no navigator can handle — React Navigation's
// "The action 'GO_BACK' was not handled by any navigator" error. Leaving must
// go back only when a back route exists, fall back to the canonical landing
// route otherwise, and be idempotent so duplicate/late close events (a second
// uj:close, a message arriving mid-unmount) can never dispatch twice.
//
// Run: npm run test:app

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import {
  FEEDBACK_FALLBACK_ROUTE,
  resolveLeaveAction,
} from './feedback-navigation.ts';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

test('leaving goes back when a back route exists', () => {
  assert.deepEqual(resolveLeaveAction({ canGoBack: true, alreadyLeaving: false }), {
    type: 'back',
  });
});

test('leaving with no back route replaces to the canonical landing route', () => {
  assert.deepEqual(resolveLeaveAction({ canGoBack: false, alreadyLeaving: false }), {
    type: 'replace',
    route: FEEDBACK_FALLBACK_ROUTE,
  });
  assert.equal(FEEDBACK_FALLBACK_ROUTE, '/');
});

test('duplicate or late close events are ignored once a leave has begun', () => {
  assert.equal(resolveLeaveAction({ canGoBack: true, alreadyLeaving: true }), null);
  assert.equal(resolveLeaveAction({ canGoBack: false, alreadyLeaving: true }), null);
});

test('the feedback screen has no unguarded native back dispatch', () => {
  const source = readFileSync(join(repoRoot, 'app/account/feedback.tsx'), 'utf8');
  assert.ok(
    source.includes('resolveLeaveAction'),
    'every leave path must go through the resolveLeaveAction guard',
  );
  assert.ok(
    source.includes('router.canGoBack()'),
    'the screen must consult router.canGoBack() before dispatching back',
  );
  assert.ok(
    !source.includes('() => router.back()'),
    'the header back button must not call router.back() unconditionally',
  );
  // Exactly one router.back() call site — inside the guarded leave helper.
  assert.equal(
    source.split('router.back()').length - 1,
    1,
    'router.back() may appear only once, inside the guarded leave path',
  );
});

test("only uj:close leaves the screen — UserJot internal navigation never does", () => {
  const source = readFileSync(join(repoRoot, 'app/account/feedback.tsx'), 'utf8');
  const handler = source.slice(
    source.indexOf('const handleMessage'),
    source.indexOf('const handleLoadFailure'),
  );
  assert.ok(
    handler.includes("type === 'uj:close'"),
    'the close bridge must key on the uj:close message',
  );
  assert.ok(
    !handler.includes('uj:open\'') || !/uj:open'[^}]*leaveFeedback/.test(handler),
    'uj:open must not trigger navigation',
  );
  const errorBranch = handler.slice(handler.indexOf("'uj:error'"));
  assert.ok(
    !errorBranch.includes('leaveFeedback()') && !errorBranch.includes('router.back'),
    'uj:error and load failures must never dispatch native back',
  );
});
