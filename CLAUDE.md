# CLAUDE.md

Guidance for Claude Code when working in this repository (Hachisu Mobile — Expo/React Native app with Supabase Edge Functions under `supabase/functions/`).

# Red → Green Regression Directive

This directive applies to ALL future bug-fix work in this repository: bugs, defects, regressions, security issues, incorrect behavior, and failed edge cases. Bug fixes must be evidence-driven and regression-safe. Do not patch symptoms without proving the failure and proving the fix.

## 1. Reproduce before fixing

When asked to fix a bug:

- First reproduce or otherwise prove the bug exists.
- Determine the actual root cause before modifying production code.
- Do not assume the reported symptom identifies the root cause.
- Inspect the relevant execution path, state transitions, API boundaries (including BTCPay Greenfield and Supabase Edge Function boundaries), database behavior (including RLS), and surrounding code as needed.

## 2. RED — create a failing regression test

Before implementing the fix, create or identify an automated test that demonstrates the bug. The test must:

- Exercise the behavior that is actually broken.
- Fail against the current implementation, for the expected reason.
- Be specific enough that it would catch the same regression in the future.
- Test externally observable behavior where practical, rather than implementation details.

Run the test and explicitly verify that it fails BEFORE making the production fix. This is the **RED** state.

Do not weaken an existing test merely to make the suite pass.

## 3. GREEN — implement the smallest correct fix

Once RED has been demonstrated:

- Implement the smallest reasonable production change that fixes the root cause.
- Avoid unrelated refactors or opportunistic changes unless they are necessary for correctness.
- Re-run the regression test and verify that the previously failing test now passes.

This is the **GREEN** state.

## 4. Regression verification

After reaching GREEN:

- Run the relevant surrounding test suite (whatever test harness covers the affected area).
- Run the repository's required static validation appropriate to the files changed — do not blindly run irrelevant tools:
  - App code (TypeScript/React Native): `npx tsc --noEmit` and `npm run lint`.
  - Supabase Edge Functions (Deno, `supabase/functions/`): `deno check` (or equivalent Deno validation) on the affected functions.
- Confirm that the fix did not break adjacent behavior.

## 5. Security bugs require adversarial regression tests

For authorization, authentication, RLS, store isolation, IDOR, privilege escalation, data leakage, account deletion, secret handling, or other security-sensitive bugs, the regression test must reproduce the **attack or unauthorized behavior** — not merely the normal happy path. Examples:

- User A attempting to access User B's resource.
- One Hachisu merchant attempting to reference another merchant's BTCPay store.
- Manipulating a resource ID supplied by the client.
- Calling an Edge Function without the required authorization.
- Attempting an operation after account/session invalidation.

Where feasible, the test should prove that the unauthorized action previously succeeded (or was insufficiently protected), and that the corrected implementation rejects it.

## 6. Exceptions

If an automated regression test is genuinely impractical (external system, platform limitation, nondeterministic dependency, or unavailable test harness):

- Do not silently skip RED.
- Explain why an automated regression test is impractical.
- Establish the strongest reproducible verification available.
- Prefer adding a lower-level unit/integration test around the affected boundary where possible.
- Document exactly how RED and GREEN were demonstrated manually.

"No test exists yet" is **not** by itself an acceptable reason to skip adding one. (This repository currently has no test runner configured — that means the first bug fix in an area may need to introduce the harness for that boundary, not that testing is optional.)

## 7. Never fake RED

Never:

- Write the fix first and then claim the test failed beforehand.
- Intentionally break code to manufacture a RED state.
- Change expected values simply to force a failure.
- Mock away the behavior actually responsible for the bug.
- Delete, skip, disable, or weaken tests to achieve GREEN.

RED must demonstrate the real pre-existing defect.

## 8. Bug-fix completion report

When reporting completion of a bug fix, include:

- **Root cause**
- **RED:** the regression test added/used and evidence it failed before the fix
- **GREEN:** the change made and evidence the regression test passes afterward
- **Regression validation:** the relevant suites and static checks run
- **Files changed**
- Any remaining limitations or untested boundaries

A bug fix is not complete merely because the code appears correct. It is complete when the defect has been reproduced, captured by regression coverage, corrected, and validated.
