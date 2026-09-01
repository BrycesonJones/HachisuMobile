// Contact form send — behavior regression.
//
// Run from supabase/functions:
//   deno test --allow-env --allow-net send-contact-message/index.test.ts
//
// This endpoint is public (no JWT), so its whole contract is: bounded validated
// input in, one fixed destination out, generic errors, and no internals or
// visitor data leaking through responses. The harness captures the handler by
// stubbing Deno.serve at import time and serves the Resend API from a stubbed
// fetch — nothing here sends real email.

import { assertEquals, assertStringIncludes } from 'jsr:@std/assert@1.0.19';

// --- capture the handler ------------------------------------------------------

type Handler = (req: Request) => Response | Promise<Response>;
let handler: Handler;

const realServe = Deno.serve;
// deno-lint-ignore no-explicit-any
(Deno as any).serve = (h: Handler) => {
  handler = h;
  return { finished: Promise.resolve(), shutdown: () => Promise.resolve(), ref() {}, unref() {} };
};
await import('./index.ts');
// deno-lint-ignore no-explicit-any
(Deno as any).serve = realServe;

// --- stub outbound fetch ------------------------------------------------------

type SentMail = { url: string; auth: string | null; payload: Record<string, unknown> };
let sent: SentMail[] = [];
let resendStatus = 200;

const realFetch = globalThis.fetch;
globalThis.fetch = ((input: Request | URL | string, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input);
  if (url.startsWith('https://api.resend.com/')) {
    const headers = new Headers(init?.headers);
    sent.push({
      url,
      auth: headers.get('Authorization'),
      payload: JSON.parse(String(init?.body ?? '{}')),
    });
    return Promise.resolve(
      new Response(JSON.stringify(resendStatus === 200 ? { id: 'email_1' } : { message: 'nope' }), {
        status: resendStatus,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  }
  return Promise.reject(new Error(`unexpected outbound fetch: ${url}`));
}) as typeof fetch;

function post(body: unknown): Promise<Response> {
  return Promise.resolve(
    handler(
      new Request('https://edge.test/send-contact-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: typeof body === 'string' ? body : JSON.stringify(body),
      }),
    ),
  );
}

function reset(status = 200) {
  sent = [];
  resendStatus = status;
  Deno.env.set('RESEND_API_KEY', 'resend-key-not-a-real-secret');
  Deno.env.delete('CONTACT_FROM_ADDRESS');
}

// --- request-shape failures are stable 4xx, and nothing is sent ---------------

Deno.test('a non-POST method is refused', async () => {
  reset();
  const res = await handler(new Request('https://edge.test/x', { method: 'GET' }));
  assertEquals(res.status, 405);
  assertEquals(sent.length, 0);
});

Deno.test('a body that is not a JSON object is a 400, not a crash', async () => {
  reset();
  for (const raw of ['null', '[]', '"hi"', '{bad', '']) {
    const res = await post(raw);
    assertEquals(res.status, 400);
  }
  assertEquals(sent.length, 0);
});

Deno.test('a missing or implausible email is refused', async () => {
  reset();
  for (const email of [undefined, '', '   ', 'not-an-email', 'a@b', 'two@a.com,b@c.com', 'line\nbreak@x.com', `${'x'.repeat(250)}@toolong.com`]) {
    const res = await post({ email, message: 'hello' });
    assertEquals(res.status, 400, `email ${JSON.stringify(email)} must be refused`);
  }
  assertEquals(sent.length, 0);
});

Deno.test('a missing, blank, or oversize message is refused', async () => {
  reset();
  for (const message of [undefined, '', '   ', 'x'.repeat(5001)]) {
    const res = await post({ email: 'a@b.co', message });
    assertEquals(res.status, 400, `message ${String(message).slice(0, 12)}… must be refused`);
  }
  assertEquals(sent.length, 0);
});

// --- the send itself ----------------------------------------------------------

Deno.test('a valid submission emails the fixed mailbox with visitor Reply-To', async () => {
  reset();
  const res = await post({ email: '  visitor@example.com ', message: '  I have a store.  ' });
  assertEquals(res.status, 200);
  assertEquals((await res.json()).ok, true);

  assertEquals(sent.length, 1);
  const mail = sent[0].payload;
  // The destination is the server's constant — never the caller's choice.
  assertEquals(mail.to, ['bryceson.jones17@gmail.com']);
  assertEquals(mail.reply_to, 'visitor@example.com');
  assertEquals(mail.subject, 'New Hachisu contact message');
  assertStringIncludes(String(mail.text), 'visitor@example.com');
  assertStringIncludes(String(mail.text), 'I have a store.');
  assertEquals(sent[0].auth, 'Bearer resend-key-not-a-real-secret');
});

Deno.test('extra body fields cannot redirect the mail (projection)', async () => {
  reset();
  const res = await post({
    email: 'visitor@example.com',
    message: 'hi',
    to: 'attacker@evil.test',
    from: 'spoof@evil.test',
    subject: 'spam',
  });
  assertEquals(res.status, 200);
  assertEquals(sent[0].payload.to, ['bryceson.jones17@gmail.com']);
  assertEquals(sent[0].payload.subject, 'New Hachisu contact message');
});

// --- failures stay generic ----------------------------------------------------

Deno.test('a missing RESEND_API_KEY is a generic 503, and nothing is sent', async () => {
  reset();
  Deno.env.delete('RESEND_API_KEY');
  const res = await post({ email: 'a@b.co', message: 'hello' });
  assertEquals(res.status, 503);
  const payload = await res.json();
  assertEquals(payload.ok, false);
  assertEquals(payload.error, 'Contact is not available right now.');
  assertEquals(sent.length, 0);
});

Deno.test('a Resend failure is a generic 502 that echoes nothing upstream said', async () => {
  reset(500);
  const res = await post({ email: 'a@b.co', message: 'hello' });
  assertEquals(res.status, 502);
  const payload = await res.json();
  assertEquals(payload.ok, false);
  assertEquals(payload.error, 'The message could not be sent. Please try again.');
});
