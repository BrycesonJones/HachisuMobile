// Reading a JSON request body without assuming its shape.
//
// OWASP A10:2025 — Mishandling of Exceptional Conditions
// (CWE-234 missing parameter, CWE-235 extra parameters, CWE-248 uncaught
// exception, CWE-476 null dereference, CWE-754 improper check).
//
// Every handler used this shape:
//
//     let body: { merchantStoreId?: unknown; ... };
//     try { body = await req.json(); } catch { return 400 }
//     const storeId = typeof body.merchantStoreId === 'string' ? ... : '';
//
// The try/catch only covers SYNTAX. `null`, `[]`, `"x"` and `7` are all valid
// JSON, so `req.json()` resolves and the guard passes — and then the next line
// dereferences the result as an object. `null.merchantStoreId` throws a
// TypeError nothing catches, which the platform turns into an opaque 500. A
// deliberately malformed body therefore produced a server-error signature
// instead of the stable 400 the same handler gives a truncated one, and the
// distinction between "your request was wrong" and "the server broke" is one
// the caller (and anyone probing it) can read.
//
// The fix is to make the object-ness part of the parse rather than an
// assumption made after it. A body that is not a JSON OBJECT is not a body this
// API accepts, and every handler says so the same way.
//
// On EXTRA parameters (CWE-235): projection stays the defence. Handlers read
// named fields off the returned record and never spread it into a database
// write or a BTCPay payload, so an unexpected key is inert and is deliberately
// not rejected — refusing unknown keys would break forward compatibility with
// older app builds for no security gain. What matters is that an extra key can
// never REPLACE a trusted value, which projection guarantees.

/**
 * Parses the request body as a JSON object.
 *
 * Returns the object on success, or `null` when the body is absent, is not
 * valid JSON, or is valid JSON that is not a plain object (`null`, an array, or
 * a bare string/number/boolean). Callers answer `null` with their own stable
 * 4xx — the response envelope differs per function, the decision does not.
 *
 * Never throws.
 */
export async function readJsonObjectBody(
  req: Request,
): Promise<Record<string, unknown> | null> {
  let parsed: unknown;
  try {
    parsed = await req.json();
  } catch {
    // Absent, truncated, or not JSON at all.
    return null;
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return null;
  }
  return parsed as Record<string, unknown>;
}
