// Edge Function: send-contact-message
//
// The hachisu.io contact form. Accepts { email, message } from an anonymous
// visitor and forwards it to the Hachisu support mailbox via Resend, with the
// visitor's address as Reply-To so a reply goes straight back to them.
//
// This endpoint is deliberately PUBLIC (deployed with --no-verify-jwt): landing
// page visitors have no Supabase session. That shapes everything here:
//
//   * the destination address is a SERVER-side constant — the client can never
//     choose who the mail goes to, so the function cannot be used as an open
//     relay;
//   * the visitor's values reach only the email BODY (as plain text) and the
//     Reply-To field, which is validated to a single address shape first;
//   * inputs are bounded (address length per RFC 5321, message capped) so the
//     function cannot be used to relay bulk payloads;
//   * failures return stable, generic messages — internals stay in the log.
//
// Required secrets: RESEND_API_KEY.
// Optional: CONTACT_FROM_ADDRESS — the verified Resend sender. Until a domain
// is verified in Resend, the default below uses Resend's shared onboarding
// sender, which Resend only delivers to the account owner's own address.

import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { readJsonObjectBody } from '../_shared/request-body.ts';

const CONTACT_TO_ADDRESS = 'bryceson.jones17@gmail.com';
const CONTACT_SUBJECT = 'New Hachisu contact message';

/** RFC 5321 limit; also the bound that keeps Reply-To a single, sane address. */
const MAX_EMAIL_LENGTH = 254;
const MAX_MESSAGE_LENGTH = 5000;

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
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ ok: false, error: 'Method not allowed' }, 405);
  }

  const body: { email?: unknown; message?: unknown } | null =
    await readJsonObjectBody(req);
  if (!body) {
    return jsonResponse({ ok: false, error: 'Invalid JSON body.' }, 400);
  }

  const email = typeof body.email === 'string' ? body.email.trim() : '';
  if (!email || !isPlausibleEmail(email)) {
    return jsonResponse({ ok: false, error: 'A valid email address is required.' }, 400);
  }

  const message = typeof body.message === 'string' ? body.message.trim() : '';
  if (!message) {
    return jsonResponse({ ok: false, error: 'A message is required.' }, 400);
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    return jsonResponse(
      { ok: false, error: `The message is too long (limit ${MAX_MESSAGE_LENGTH} characters).` },
      400,
    );
  }

  const resendApiKey = Deno.env.get('RESEND_API_KEY');
  if (!resendApiKey) {
    // Configuration, not caller error — but the caller gets no internals.
    console.error(JSON.stringify({ event: 'contact.send_unavailable', reason: 'missing_api_key' }));
    return jsonResponse({ ok: false, error: 'Contact is not available right now.' }, 503);
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
    return jsonResponse({ ok: false, error: 'The message could not be sent. Please try again.' }, 502);
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
          errorDetail = rec.message.replace(/[\r\n\u2028\u2029]/g, ' ').slice(0, 240);
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
    return jsonResponse({ ok: false, error: 'The message could not be sent. Please try again.' }, 502);
  }

  return jsonResponse({ ok: true });
});
