// Regression guard: while the Google-auth product gate is off, no shipped
// client surface may expose or invoke Google sign-in.
//
// WHY THIS EXISTS. Hachisu's iOS MVP deliberately ships only its own
// email/OTP account setup and sign-in system. Apple's Guideline 4.8 attaches
// additional obligations to an app that uses a third-party login service to
// set up or authenticate the user's primary account, and it does not attach
// to an app whose sign-in is exclusively first-party. Re-exposing a
// third-party login entry point therefore changes which rules the shipped app
// is evaluated against — it is a product decision, not a UI tweak, and it must
// be made by flipping GOOGLE_AUTH_ENABLED rather than by adding a button.
//
// This is a source-level invariant in the style of lib/auth/pre-auth-screens
// .test.ts and this repo's check:* guards. It deliberately checks the SHIPPED
// surface (app/ and components/), not lib/: the OAuth machinery in
// lib/auth/auth-service.ts and lib/auth/oauth-callback.ts stays intact and
// tested (PKCE enforcement, callback interpretation), because deleting proven
// security code to disable a product surface would trade one risk for another.
// What must not exist is a way for a user to reach it.
//
// Run: npm run test:app

import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Strips comments so documentation may name Google without tripping the guard. */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(full) && !full.endsWith('.test.ts')) out.push(full);
  }
  return out;
}

/**
 * The Google button component itself is allowed to exist: it is dormant
 * presentation code kept for a future non-iOS surface, and it renders nothing
 * unless a screen imports it. This guard's job is to prove nothing does.
 */
const BUTTON_COMPONENT = join('components', 'auth', 'google-signin-button.tsx');

/**
 * Tokens that would put a Google authentication entry point — or its
 * supporting UI state — in front of a user.
 */
const GOOGLE_UI_TOKENS = [
  'GoogleSignInButton',
  'signInWithGoogleOAuth',
  'handleGoogle',
  'isGoogleLoading',
  'Continue with Google',
  'Sign in with Google',
  'Sign up with Google',
  "provider: 'google'",
  'provider: "google"',
];

// ---------------------------------------------------------------------------
// 1. The gate exists and ships disabled.
// ---------------------------------------------------------------------------
test('GOOGLE_AUTH_ENABLED exists and is disabled for the shipped build', () => {
  const source = readFileSync(join(repoRoot, 'constants/feature-flags.ts'), 'utf8');

  const declaration = /export\s+const\s+GOOGLE_AUTH_ENABLED\s*=\s*([^;]+);/.exec(source);
  assert.ok(
    declaration,
    'constants/feature-flags.ts must export GOOGLE_AUTH_ENABLED so the Google ' +
      'sign-in surface is governed by one explicit product gate.',
  );
  assert.equal(
    declaration[1].trim(),
    'false',
    'GOOGLE_AUTH_ENABLED must be the literal false in the shipped build. ' +
      'Enabling third-party login changes which App Store login-service ' +
      'obligations apply to the submitted app, so it must be a deliberate ' +
      'flag change reviewed alongside an equivalent-login strategy.',
  );
});

// ---------------------------------------------------------------------------
// 2. No shipped screen or component exposes Google sign-in.
// ---------------------------------------------------------------------------
test('no shipped client surface renders or invokes Google sign-in', () => {
  const files = [...walk(join(repoRoot, 'app')), ...walk(join(repoRoot, 'components'))];
  assert.ok(files.length > 0, 'expected shipped client sources under app/ and components/');

  for (const file of files) {
    const rel = relative(repoRoot, file);
    if (rel.split(sep).join('/') === BUTTON_COMPONENT.split(sep).join('/')) continue;

    const source = withoutComments(readFileSync(file, 'utf8'));
    for (const token of GOOGLE_UI_TOKENS) {
      assert.ok(
        !source.includes(token),
        `${rel} references "${token}", which puts a Google sign-in entry point ` +
          'in the shipped app while GOOGLE_AUTH_ENABLED is false. Hachisu ships ' +
          'its own email/OTP sign-in exclusively; re-introducing a third-party ' +
          'login option requires flipping that flag deliberately.',
      );
    }
  }
});

// ---------------------------------------------------------------------------
// 3. The two signup screens keep working email/OTP entry points.
//    (A guard that passed because the screens were emptied would be useless.)
// ---------------------------------------------------------------------------
for (const screen of ['app/auth/personal-email.tsx', 'app/auth/business-email.tsx']) {
  test(`${screen} still offers first-party email/OTP sign-up`, () => {
    const source = withoutComments(readFileSync(join(repoRoot, screen), 'utf8'));

    assert.ok(
      source.includes('sendEmailOtp'),
      `${screen} must still send the email OTP — it is the only account setup path.`,
    );
    assert.ok(
      /LabeledTextInput|keyboardType="email-address"/.test(source),
      `${screen} must still render an email entry field.`,
    );
  });
}

// ---------------------------------------------------------------------------
// 4. Disabling the product surface must not delete the OAuth security logic.
//    PKCE and the callback interpreter are proven, separately tested code; a
//    future re-enable must not have to reinvent them under time pressure.
// ---------------------------------------------------------------------------
test('OAuth security infrastructure is retained while the surface is gated off', () => {
  const options = readFileSync(join(repoRoot, 'lib/auth/supabase-auth-options.ts'), 'utf8');
  assert.ok(
    /flowType\s*:\s*'pkce'/.test(options),
    'PKCE must remain pinned: it protects every authorization-code exchange, ' +
      'and check:config enforces it independently.',
  );

  const callback = readFileSync(join(repoRoot, 'lib/auth/oauth-callback.ts'), 'utf8');
  assert.ok(
    callback.includes('export function interpretOAuthCallback'),
    'the OAuth callback interpreter must be retained — it is what refuses ' +
      'implicit-flow tokens delivered to the app custom scheme.',
  );
});

// ---------------------------------------------------------------------------
// 5. The gate is enforced in code, not only in the UI. This is what makes it
//    safe to leave the provider configured server-side: even a programmatic
//    call from a future code path is refused while the flag is off.
// ---------------------------------------------------------------------------
test('signInWithGoogleOAuth refuses to run while the gate is off', () => {
  const source = readFileSync(join(repoRoot, 'lib/auth/auth-service.ts'), 'utf8');

  const start = source.indexOf('export async function signInWithGoogleOAuth');
  assert.notEqual(start, -1, 'expected signInWithGoogleOAuth in lib/auth/auth-service.ts');

  // The body ends at the first line that is exactly "}" (newline-brace-newline).
  // The multi-line return type closes with "}> {", so it cannot match here.
  const end = source.indexOf('\n}\n', start);
  assert.notEqual(end, -1, 'could not find the end of signInWithGoogleOAuth');
  const body = source.slice(start, end);

  assert.ok(
    body.includes('GOOGLE_AUTH_ENABLED'),
    'signInWithGoogleOAuth must check GOOGLE_AUTH_ENABLED and return early ' +
      'while it is false, so the disabled state cannot be bypassed by any ' +
      'caller that skips the UI.',
  );
});
