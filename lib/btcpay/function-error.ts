/**
 * supabase-js hides the response body on a non-2xx `functions.invoke`, replacing
 * it with a generic message. Our Edge Functions always answer with a JSON
 * `{ error }` (and sometimes `{ code }`), so this pulls the real, already
 * server-redacted message back out. Returns undefined when the body was not
 * readable, so the caller can fall back to its own copy rather than showing an
 * empty error.
 */
export async function readFunctionError(error: unknown): Promise<string | undefined> {
  const context = (error as { context?: unknown })?.context;
  if (context && typeof (context as Response).json === 'function') {
    try {
      const body = await (context as Response).json();
      if (body && typeof body.error === 'string') return body.error;
    } catch {
      // Body was not JSON — fall through to the caller's generic message.
    }
  }
  return undefined;
}
