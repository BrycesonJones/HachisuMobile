// Client-side guard for the BTCPay checkout URL the merchant shares or opens.
//
// The URL is produced by BTCPay and origin-checked server-side against the
// configured BTCPAY_SERVER_URL before it is ever returned to the app, so this is
// the second line of defense rather than the only one. It exists because a URL
// can also reach the screen from the in-memory activity cache, and because the
// app must never hand a customer — or the OS — something that is not an https
// web link.
//
// Deliberately NOT host-pinned: the BTCPay hostname is server configuration and
// is not exposed to the mobile bundle, so hardcoding it here would both leak
// deployment detail into the client and break any other environment.

/**
 * True when `url` is a syntactically valid https:// URL with a real host and no
 * embedded credentials — i.e. safe to place in a share sheet or hand to the OS.
 * Anything else (null, empty, http, custom schemes, javascript:, garbage) is
 * rejected so the UI can say the link is unavailable rather than acting on it.
 */
export function isShareableCheckoutUrl(url: string | null | undefined): url is string {
  if (typeof url !== 'string' || !url.trim()) return false;
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:') return false;
  if (!parsed.hostname) return false;
  if (parsed.username || parsed.password) return false;
  return true;
}
