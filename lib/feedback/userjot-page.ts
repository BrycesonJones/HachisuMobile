// UserJot feedback surface for the in-app WebView (app/account/feedback.tsx).
//
// UserJot has no React Native SDK; its supported mobile path is the Widget v3
// browser SDK running inside a webview. This module builds the self-contained
// HTML document the WebView renders: it loads the v3 SDK from UserJot's CDN,
// hides the floating launcher, identifies the signed-in user, and opens the
// widget directly to the feedback experience.
//
// Identity policy (Hachisu is a payments app — metadata stays minimal):
// only the canonical Supabase auth user ID and, when present, the email are
// ever sent. buildUserJotIdentity is the single choke point — it copies the
// two allowed fields onto a fresh object, so store/wallet/payment columns on
// whatever object is passed in can never reach the page.

/**
 * Origin the inline document claims via WebView baseUrl. Hachisu's own web
 * origin, so the widget session is scoped to a domain Hachisu controls.
 */
export const USERJOT_PAGE_BASE_URL = 'https://hachisu.io';

export const USERJOT_SDK_URL = 'https://cdn.userjot.com/sdk/v3/uj.js';

/** Message types posted from the page to React Native via ReactNativeWebView. */
export const USERJOT_BRIDGE_EVENTS = {
  open: 'uj:open',
  close: 'uj:close',
  error: 'uj:error',
} as const;

export interface UserJotIdentity {
  /** Canonical immutable Supabase auth user ID. */
  id: string;
  email?: string;
}

/**
 * Reduce the auth user to the minimal UserJot identity. Returns null when
 * there is no usable user (the widget then runs anonymously).
 */
export function buildUserJotIdentity(
  user: { id?: string | null; email?: string | null } | null | undefined,
): UserJotIdentity | null {
  if (!user?.id) return null;
  const identity: UserJotIdentity = { id: user.id };
  if (user.email) identity.email = user.email;
  return identity;
}

/**
 * JSON-serialize a value for embedding inside an inline <script>. Escapes the
 * characters that could terminate the script block or break parsing.
 */
export function serializeForInlineScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

/**
 * Main-frame navigation guard for the WebView. Allows only the inline page's
 * own base origin and UserJot's origins; everything else is blocked.
 */
export function isAllowedUserJotUrl(url: string): boolean {
  if (url === 'about:blank' || url === 'about:srcdoc') return true;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:') return false;
  if (parsed.origin === USERJOT_PAGE_BASE_URL) return true;
  const host = parsed.hostname;
  return host === 'userjot.com' || host.endsWith('.userjot.com');
}

/**
 * iOS may kill the WKWebView content process (e.g. memory pressure), leaving
 * a blank view. Recovery policy: reload silently once per screen visit; any
 * further termination surfaces the failure UI instead of looping reloads.
 */
export function resolveTerminationRecovery(
  previousAutoRecoveries: number,
): 'reload' | 'fail' {
  return previousAutoRecoveries < 1 ? 'reload' : 'fail';
}

export interface UserJotPageOptions {
  projectId: string;
  identity: UserJotIdentity | null;
  backgroundColor: string;
}

/**
 * Build the HTML document hosting the UserJot widget. The page reports
 * lifecycle back to React Native (`uj:open`, `uj:close`, `uj:error`) so the
 * screen can drop its loading state, surface failures, and pop on close.
 */
export function buildUserJotFeedbackHtml(options: UserJotPageOptions): string {
  const projectId = serializeForInlineScript(options.projectId);
  const identity = serializeForInlineScript(options.identity);
  const initOptions = serializeForInlineScript({
    widget: { launcher: false, theme: 'dark', position: 'right' },
    // Never share the host page URL with UserJot.
    pageContext: 'none',
  });
  const openTarget = serializeForInlineScript({ to: 'feedback' });

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<style>html, body { margin: 0; padding: 0; background: ${options.backgroundColor}; }</style>
</head>
<body>
<script>
(function () {
  function send(type, detail) {
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: type, detail: detail == null ? null : String(detail) }));
    }
  }
  window.uj ||= new Proxy({}, { get: (_, p) => p == 'then' ? 0 : (...a) => { (window.$ujq ||= []).push([p, ...a]) } });
  uj.on('open', function () { send('uj:open'); });
  uj.on('close', function () { send('uj:close'); });
  uj.on('error', function () { send('uj:error'); });
  uj.init(${projectId}, ${initOptions});
  uj.open(${openTarget});
  var identity = ${identity};
  // Identify once the SDK is real so the result is observable. A rejected
  // identify (e.g. UserJot refuses unsigned identity for privileged workspace
  // members) is non-fatal — the widget continues anonymously, which allows
  // posting/voting but disables commenting — and is reported to React Native
  // by its error CODE only, never the identity payload.
  uj.on('ready', function () {
    if (!identity) return;
    try {
      var p = uj.identify({ user: identity });
      if (p && p.catch) {
        p.catch(function (e) {
          var cause = e && e.cause && e.cause.code;
          send('uj:identify-failed', cause || (e && e.code) || 'unknown');
        });
      }
    } catch (e) {
      send('uj:identify-failed', 'threw');
    }
  });
})();
</script>
<script type="module" async src="${USERJOT_SDK_URL}"></script>
</body>
</html>`;
}
