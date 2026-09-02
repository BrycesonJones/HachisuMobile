// Edge Function: send-contact-message
//
// The hachisu.io contact form. Accepts { email, message } from an anonymous
// visitor and forwards it to the Hachisu support mailbox via Resend, with the
// visitor's address as Reply-To so a reply goes straight back to them.
//
// This endpoint is deliberately PUBLIC (deployed with --no-verify-jwt, and
// registered as declared-public in scripts/check-deployed-functions.mjs, which
// verifies the deployed verify_jwt state against that declaration in both
// directions): landing page visitors have no Supabase session. That shapes
// everything here:
//
//   * the destination address is a SERVER-side constant — the client can never
//     choose who the mail goes to, so the function cannot be used as an open
//     relay;
//   * the visitor's values reach only the email BODY (as plain text) and the
//     Reply-To field, which is validated to a single address shape first;
//   * inputs are bounded (address length per RFC 5321, message capped, request
//     body size checked before parsing) so the function cannot be used to
//     relay bulk payloads;
//   * CORS is granted only to the Hachisu web origins (and local dev), never
//     `*` — CORS is not authentication, but the grant must not invite
//     arbitrary third-party pages to drive this endpoint from their visitors'
//     browsers;
//   * failures return stable, generic messages — internals stay in the log.
//
// Required secrets: RESEND_API_KEY.
// Optional: CONTACT_FROM_ADDRESS — the verified Resend sender. Until a domain
// is verified in Resend, the default below uses Resend's shared onboarding
// sender, which Resend only delivers to the account owner's own address.

import { readJsonObjectBody } from '../_shared/request-body.ts';

const CONTACT_TO_ADDRESS = 'bryceson.jones17@gmail.com';
const CONTACT_SUBJECT = 'New Hachisu contact message';

/** RFC 5321 limit; also the bound that keeps Reply-To a single, sane address. */
const MAX_EMAIL_LENGTH = 254;
const MAX_MESSAGE_LENGTH = 5000;

/**
 * Refused before parsing. Far above any legitimate payload (a maximal
 * JSON-escaped submission is under 32 KiB) — this bounds what a caller can
 * make the handler buffer and parse, not what it can make it accept.
 */
const MAX_BODY_BYTES = 64 * 1024;

/**
 * The only browser origins granted CORS. hachisu.io is where the contact form
 * lives; localhost/127.0.0.1 cover local development of web/. Everything else
 * gets no grant: preflight fails, so foreign pages cannot drive this endpoint
 * from their visitors' browsers. (Non-browser clients are unaffected — CORS is
 * scoping, not authentication.)
 */
const ALLOWED_ORIGINS = new Set(['https://hachisu.io', 'https://www.hachisu.io']);

function isAllowedOrigin(origin: string): boolean {
  if (ALLOWED_ORIGINS.has(origin)) return true;
  return /^http:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?$/.test(origin);
}

/** Per-request CORS headers: an exact-origin grant for allowed origins only. */
function corsHeadersFor(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') ?? '';
  const headers: Record<string, string> = { Vary: 'Origin' };
  if (isAllowedOrigin(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Headers'] =
      'authorization, x-client-info, apikey, content-type';
    headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS';
  }
  return headers;
}

function jsonResponse(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeadersFor(req), 'Content-Type': 'application/json' },
  });
}

/**
 * One address, no whitespace, no header-breaking characters. Deliberately
 * simple: it exists to guarantee "a single plausible mailbox", not to litigate
 * RFC 5322 — Resend rejects what it cannot deliver to.
 */
function isPlausibleEmail(value: string): boolean {
  if (value.length > MAX_EMAIL_LENGTH) return false;
  // deno-lint-ignore no-control-regex
  if (/[\x00-\x1f\x7f,;<>]/.test(value)) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeadersFor(req) });
  }
  if (req.method !== 'POST') {
    return jsonResponse(req, { ok: false, error: 'Method not allowed' }, 405);
  }

  const declaredLength = Number(req.headers.get('Content-Length') ?? '0');
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return jsonResponse(req, { ok: false, error: 'The request is too large.' }, 413);
  }

  const body: { email?: unknown; message?: unknown } | null =
    await readJsonObjectBody(req);
  if (!body) {
    return jsonResponse(req, { ok: false, error: 'Invalid JSON body.' }, 400);
  }

  const email = typeof body.email === 'string' ? body.email.trim() : '';
  if (!email || !isPlausibleEmail(email)) {
    return jsonResponse(req, { ok: false, error: 'A valid email address is required.' }, 400);
  }

  const message = typeof body.message === 'string' ? body.message.trim() : '';
  if (!message) {
    return jsonResponse(req, { ok: false, error: 'A message is required.' }, 400);
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    return jsonResponse(
      req,
      { ok: false, error: `The message is too long (limit ${MAX_MESSAGE_LENGTH} characters).` },
      400,
    );
  }

  const resendApiKey = Deno.env.get('RESEND_API_KEY');
  if (!resendApiKey) {
    // Configuration, not caller error — but the caller gets no internals.
    console.error(JSON.stringify({ event: 'contact.send_unavailable', reason: 'missing_api_key' }));
    return jsonResponse(req, { ok: false, error: 'Contact is not available right now.' }, 503);
  }
  const fromAddress =
    Deno.env.get('CONTACT_FROM_ADDRESS') ?? 'Hachisu Contact <onboarding@resend.dev>';

  // Plain text only: the visitor's message is data, never markup.
  const text =
    `New contact message from the hachisu.io landing page.\n\n` +
    `From: ${email}\n\n` +
    `Message:\n${message}\n`;

  let resendResponse: Response;
  try {
    resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromAddress,
        to: [CONTACT_TO_ADDRESS],
        reply_to: email,
        subject: CONTACT_SUBJECT,
        text,
      }),
    });
  } catch {
    // Network failure reaching Resend. Nothing caller-specific to record.
    console.error(JSON.stringify({ event: 'contact.send_failed', reason: 'network' }));
    return jsonResponse(req, { ok: false, error: 'The message could not be sent. Please try again.' }, 502);
  }

  if (!resendResponse.ok) {
    // Never the raw body (CWE-532) — but a send that Resend refuses is almost
    // always a CONFIGURATION problem (unverified sender domain, testing-mode
    // recipient restriction), and a bare status cannot be acted on. So parse
    // Resend's structured error and log a bounded projection of its own two
    // fields: no visitor data is in either, values are truncated and kept to
    // one JSON line.
    let errorName = '';
    let errorDetail = '';
    try {
      const parsed: unknown = await resendResponse.json();
      if (parsed && typeof parsed === 'object') {
        const rec = parsed as Record<string, unknown>;
        if (typeof rec.name === 'string') errorName = rec.name.slice(0, 64);
        if (typeof rec.message === 'string') {
          // All whitespace (line and paragraph separators included) collapses
          // to single spaces: the projection stays one JSON log line.
          errorDetail = rec.message.replace(/\s+/g, ' ').slice(0, 240);
        }
      }
    } catch {
      // An unparseable error body stays unlogged; the status is still recorded.
    }
    console.error(
      JSON.stringify({
        event: 'contact.send_failed',
        status: resendResponse.status,
        errorName,
        errorDetail,
      }),
    );
    return jsonResponse(req, { ok: false, error: 'The message could not be sent. Please try again.' }, 502);
  }

  return jsonResponse(req, { ok: true });
});
