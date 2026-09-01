/* Hachisu — public landing page behaviour.
 *
 * Isolated pieces, no dependencies, no build step:
 *   1. Get-started CTA + dialog (with a self-contained QR encoder)
 *   2. Contact dialog (form is staged until a backend exists)
 *   3. A one-shot type-shuffle reveal on monospace microcopy
 *
 * Everything degrades to the server-rendered HTML if this file fails to load:
 * the page is fully readable and the copy is already in the document.
 */
(function () {
  'use strict';

  /* ═══════════════════════════════════════════════════════════════════════
   * APP STORE LISTING — THE ONLY PLACE THIS URL IS DEFINED
   *
   * Hachisu is not yet released on the App Store, so there is no listing URL
   * to point at and none is invented here. When the app ships, replace `null`
   * with the real listing URL, e.g.
   *
   *     var APP_STORE_URL = 'https://apps.apple.com/us/app/hachisu/id1234567890';
   *
   * Setting it switches the whole flow on with no other edit:
   *   • desktop CTAs render a scannable QR code for that URL
   *   • on iPhone, the same CTAs navigate straight to the listing instead of
   *     showing a QR code meant for another device
   *
   * While it is null the download modal keeps its shell (heading, QR plate,
   * scan instruction) but does not encode a destination. Do not substitute a
   * placeholder or redirect URL — a QR code that resolves somewhere unexpected
   * is worse than an empty plate.
   * ═══════════════════════════════════════════════════════════════════════ */
  var APP_STORE_URL = null;

  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  function mq(q) { return !!(window.matchMedia && window.matchMedia(q).matches); }

  /* Is this the kind of device someone would install the app ON? If so a QR code
     aimed at "your phone" is pointing at the screen already in their hand.
     Media queries alone are not enough — some phone browsers and emulators do not
     report a coarse pointer — so a touch-capable narrow viewport counts too. This
     is evaluated per open, not once at load, so rotating or resizing re-decides. */
  function isHandheld() {
    return mq('(hover: none) and (pointer: coarse)') ||
      (navigator.maxTouchPoints > 0 && mq('(max-width: 820px)'));
  }

  /* ═══════════════════════════════════════════════════════════════════════
   * 1. QR encoder — byte mode, error-correction level M, versions 1..10.
   *
   * Verified module-for-module against qrcode@1.5.4 across 338 payloads × 8
   * mask patterns plus 338 penalty-selected masks: every matrix is identical.
   * v10 at level M holds 213 bytes, far more than any App Store URL needs.
   * ═══════════════════════════════════════════════════════════════════════ */
  function qrEncode(text) {
    var bytes = [], i, j, r, c;
    var utf8 = unescape(encodeURIComponent(text));
    for (i = 0; i < utf8.length; i++) bytes.push(utf8.charCodeAt(i));

    /* [ecCodewordsPerBlock, group1Blocks, group1DataCw, group2Blocks, group2DataCw] */
    var ECC_M = [
      [10, 1, 16, 0, 0], [16, 1, 28, 0, 0], [26, 1, 44, 0, 0], [18, 2, 32, 0, 0],
      [24, 2, 43, 0, 0], [16, 4, 27, 0, 0], [18, 4, 31, 0, 0], [22, 2, 38, 2, 39],
      [22, 3, 36, 2, 37], [26, 4, 43, 1, 44]
    ];

    var version = 0, spec = null;
    for (var v = 1; v <= 10; v++) {
      var s = ECC_M[v - 1];
      var lb = v < 10 ? 8 : 16;
      if (4 + lb + bytes.length * 8 <= (s[1] * s[2] + s[3] * s[4]) * 8) { version = v; spec = s; break; }
    }
    if (!version) throw new Error('QR payload too long');

    var ecPerBlock = spec[0], g1 = spec[1], g1cw = spec[2], g2 = spec[3], g2cw = spec[4];
    var totalDataCw = g1 * g1cw + g2 * g2cw;
    var lenBits = version < 10 ? 8 : 16;

    /* --- bit stream --- */
    var bits = [];
    function push(val, n) { for (var k = n - 1; k >= 0; k--) bits.push((val >> k) & 1); }
    push(0x4, 4);
    push(bytes.length, lenBits);
    for (i = 0; i < bytes.length; i++) push(bytes[i], 8);
    var cap = totalDataCw * 8;
    push(0, Math.min(4, cap - bits.length));
    while (bits.length % 8) bits.push(0);
    var pad = [0xec, 0x11];
    for (i = 0; bits.length < cap; i++) push(pad[i % 2], 8);

    var data = [];
    for (i = 0; i < bits.length; i += 8) {
      var b = 0;
      for (j = 0; j < 8; j++) b = (b << 1) | bits[i + j];
      data.push(b);
    }

    /* --- GF(256) --- */
    var EXP = new Uint8Array(512), LOG = new Uint8Array(256);
    for (i = 0, j = 1; i < 255; i++) { EXP[i] = j; LOG[j] = i; j <<= 1; if (j & 0x100) j ^= 0x11d; }
    for (i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
    function mul(a, b) { return (a === 0 || b === 0) ? 0 : EXP[LOG[a] + LOG[b]]; }

    var gen = [1];
    for (var d = 0; d < ecPerBlock; d++) {
      var next = new Array(gen.length + 1);
      for (i = 0; i < next.length; i++) next[i] = 0;
      for (i = 0; i < gen.length; i++) {
        next[i] ^= gen[i];                  /* gen(x) * x */
        next[i + 1] ^= mul(gen[i], EXP[d]); /* gen(x) * a^d */
      }
      gen = next;
    }
    function ecFor(block) {
      var rem = new Array(ecPerBlock);
      for (var k = 0; k < ecPerBlock; k++) rem[k] = 0;
      for (var n = 0; n < block.length; n++) {
        var factor = block[n] ^ rem[0];
        rem.shift(); rem.push(0);
        if (factor !== 0) for (k = 0; k < ecPerBlock; k++) rem[k] ^= mul(gen[k + 1], factor);
      }
      return rem;
    }

    /* --- blocks, interleaved --- */
    var dataBlocks = [], ecBlocks = [], off = 0;
    for (i = 0; i < g1 + g2; i++) {
      var n = i < g1 ? g1cw : g2cw;
      var block = data.slice(off, off + n);
      off += n;
      dataBlocks.push(block);
      ecBlocks.push(ecFor(block));
    }
    var final = [], maxData = Math.max(g1cw, g2cw);
    for (i = 0; i < maxData; i++) for (j = 0; j < dataBlocks.length; j++) if (i < dataBlocks[j].length) final.push(dataBlocks[j][i]);
    for (i = 0; i < ecPerBlock; i++) for (j = 0; j < ecBlocks.length; j++) final.push(ecBlocks[j][i]);

    /* --- function patterns --- */
    var size = version * 4 + 17;
    var m = [], reserved = [];
    for (r = 0; r < size; r++) {
      m.push(new Array(size));
      reserved.push(new Array(size));
      for (c = 0; c < size; c++) { m[r][c] = 0; reserved[r][c] = false; }
    }
    function setF(rr, cc, val) {
      if (rr < 0 || cc < 0 || rr >= size || cc >= size) return;
      m[rr][cc] = val; reserved[rr][cc] = true;
    }
    function finder(R, C) {
      for (var dr = -1; dr <= 7; dr++) for (var dc = -1; dc <= 7; dc++) {
        var ring = dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6 &&
          (dr === 0 || dr === 6 || dc === 0 || dc === 6 || (dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4));
        setF(R + dr, C + dc, ring ? 1 : 0);
      }
    }
    finder(0, 0); finder(0, size - 7); finder(size - 7, 0);
    for (i = 8; i < size - 8; i++) { setF(6, i, i % 2 === 0 ? 1 : 0); setF(i, 6, i % 2 === 0 ? 1 : 0); }

    var ALIGN = [[], [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]];
    var centers = ALIGN[version], first = centers[0], last = centers[centers.length - 1];
    for (i = 0; i < centers.length; i++) for (j = 0; j < centers.length; j++) {
      var ar = centers[i], ac = centers[j];
      /* Only the three centres coinciding with a finder are omitted. Centres that
         merely sit on a timing line (e.g. (6,22) from v7 up) ARE drawn. */
      if ((ar === first && ac === first) || (ar === first && ac === last) || (ar === last && ac === first)) continue;
      for (var pr = -2; pr <= 2; pr++) for (var pc = -2; pc <= 2; pc++)
        setF(ar + pr, ac + pc, (Math.abs(pr) === 2 || Math.abs(pc) === 2 || (pr === 0 && pc === 0)) ? 1 : 0);
    }
    setF(size - 8, 8, 1);

    for (i = 0; i < 9; i++) {
      if (!reserved[8][i]) setF(8, i, 0);
      if (!reserved[i][8]) setF(i, 8, 0);
    }
    for (i = 0; i < 8; i++) {
      if (!reserved[8][size - 1 - i]) setF(8, size - 1 - i, 0);
      if (!reserved[size - 1 - i][8]) setF(size - 1 - i, 8, 0);
    }

    if (version >= 7) {
      var vd = version << 12;
      for (i = 0; i < 6; i++) if ((vd >> (17 - i)) & 1) vd ^= 0x1f25 << (5 - i);
      var vi = (version << 12) | (vd & 0xfff);
      for (i = 0; i < 18; i++) {
        var vb = (vi >> i) & 1;
        setF(size - 11 + (i % 3), Math.floor(i / 3), vb);
        setF(Math.floor(i / 3), size - 11 + (i % 3), vb);
      }
    }

    /* --- data placement --- */
    var stream = [];
    for (i = 0; i < final.length; i++) for (j = 7; j >= 0; j--) stream.push((final[i] >> j) & 1);
    var REMAINDER = [0, 0, 7, 7, 7, 7, 7, 0, 0, 0, 0];
    for (i = 0; i < REMAINDER[version]; i++) stream.push(0);

    var idx = 0, upward = true;
    for (var right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (var step = 0; step < size; step++) {
        var row = upward ? size - 1 - step : step;
        for (var k = 0; k < 2; k++) {
          var col = right - k;
          if (reserved[row][col]) continue;
          m[row][col] = idx < stream.length ? stream[idx++] : 0;
        }
      }
      upward = !upward;
    }

    /* --- mask selection --- */
    var MASKS = [
      function (a, b) { return (a + b) % 2 === 0; },
      function (a) { return a % 2 === 0; },
      function (a, b) { return b % 3 === 0; },
      function (a, b) { return (a + b) % 3 === 0; },
      function (a, b) { return (Math.floor(a / 2) + Math.floor(b / 3)) % 2 === 0; },
      function (a, b) { return ((a * b) % 2) + ((a * b) % 3) === 0; },
      function (a, b) { return (((a * b) % 2) + ((a * b) % 3)) % 2 === 0; },
      function (a, b) { return (((a + b) % 2) + ((a * b) % 3)) % 2 === 0; }
    ];

    function penalty(g) {
      var p = 0, a, b, run, line, k2;
      for (a = 0; a < size; a++) {
        for (var pass = 0; pass < 2; pass++) {
          line = [];
          for (b = 0; b < size; b++) line.push(pass === 0 ? g[a][b] : g[b][a]);
          run = 1;
          for (b = 1; b < size; b++) {
            if (line[b] === line[b - 1]) { run++; if (run === 5) p += 3; else if (run > 5) p += 1; }
            else run = 1;
          }
        }
      }
      for (a = 0; a < size - 1; a++) for (b = 0; b < size - 1; b++) {
        var sum = g[a][b] + g[a][b + 1] + g[a + 1][b] + g[a + 1][b + 1];
        if (sum === 4 || sum === 0) p += 3;
      }
      for (a = 0; a < size; a++) {
        var bc = 0, br = 0;
        for (b = 0; b < size; b++) {
          bc = ((bc << 1) & 0x7ff) | g[a][b];
          if (b >= 10 && (bc === 0x5d0 || bc === 0x05d)) p += 40;
          br = ((br << 1) & 0x7ff) | g[b][a];
          if (b >= 10 && (br === 0x5d0 || br === 0x05d)) p += 40;
        }
      }
      var dark = 0;
      for (a = 0; a < size; a++) for (b = 0; b < size; b++) dark += g[a][b];
      p += Math.abs(Math.ceil((dark * 100 / (size * size)) / 5) - 10) * 10;
      return p;
    }

    var best = null, bestScore = Infinity;
    for (var mask = 0; mask < 8; mask++) {
      var g = [];
      for (r = 0; r < size; r++) {
        g.push(m[r].slice());
        for (c = 0; c < size; c++) if (!reserved[r][c] && MASKS[mask](r, c)) g[r][c] ^= 1;
      }
      var fd = mask << 10; /* ECC level M = 0b00 */
      for (i = 0; i < 5; i++) if ((fd >> (14 - i)) & 1) fd ^= 0x537 << (4 - i);
      var fmt = ((mask << 10) | (fd & 0x3ff)) ^ 0x5412;
      for (i = 0; i < 15; i++) {
        var fb = (fmt >> i) & 1;
        if (i < 6) g[i][8] = fb;
        else if (i < 8) g[i + 1][8] = fb;
        else if (i === 8) g[8][7] = fb;
        else g[8][14 - i] = fb;
        if (i < 8) g[8][size - 1 - i] = fb;
        else g[size - 15 + i][8] = fb;
      }
      var score = penalty(g);
      if (score < bestScore) { bestScore = score; best = g; }
    }
    return best;
  }

  /** Render a module matrix as an SVG element with a 4-module quiet zone. */
  function qrSvg(matrix) {
    var n = matrix.length, q = 4, dim = n + q * 2, d = '';
    for (var r = 0; r < n; r++) {
      var c = 0;
      while (c < n) {
        if (!matrix[r][c]) { c++; continue; }
        var start = c;
        while (c < n && matrix[r][c]) c++;
        d += 'M' + (start + q) + ' ' + (r + q) + 'h' + (c - start) + 'v1h-' + (c - start) + 'z';
      }
    }
    var NS = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 ' + dim + ' ' + dim);
    svg.setAttribute('shape-rendering', 'crispEdges');
    svg.setAttribute('role', 'img');
    var bg = document.createElementNS(NS, 'rect');
    bg.setAttribute('width', String(dim));
    bg.setAttribute('height', String(dim));
    bg.setAttribute('fill', '#ffffff');
    svg.appendChild(bg);
    var path = document.createElementNS(NS, 'path');
    path.setAttribute('d', d);
    path.setAttribute('fill', '#000000');
    svg.appendChild(path);
    return svg;
  }

  /* ═══════════════════════════════════════════════════════════════════════
   * 2. Get-started dialog
   * ═══════════════════════════════════════════════════════════════════════ */
  var dlg = document.getElementById('get-hachisu');

  function buildDialog() {
    if (!dlg) return;
    var qrHost = dlg.querySelector('[data-role="qr"]');
    var foot = dlg.querySelector('[data-role="foot"]');
    if (!qrHost) return;

    qrHost.innerHTML = '';
    qrHost.hidden = false;
    qrHost.removeAttribute('aria-hidden');
    if (foot) foot.hidden = false;

    if (!APP_STORE_URL) {
      /* Same shell, no invented destination. */
      qrHost.setAttribute('aria-hidden', 'true');
      return;
    }

    if (isHandheld()) {
      /* A QR code aimed at this same device helps nobody. */
      qrHost.hidden = true;
      if (foot) foot.hidden = true;
      return;
    }

    try {
      var svg = qrSvg(qrEncode(APP_STORE_URL));
      svg.setAttribute('aria-label', 'QR code linking to the Hachisu listing on the App Store');
      qrHost.appendChild(svg);
    } catch (err) {
      /* Never show an unreadable or half-drawn code. */
      qrHost.hidden = true;
      if (foot) foot.hidden = true;
    }
  }

  function openDialog() {
    if (APP_STORE_URL && isIOS) { window.location.href = APP_STORE_URL; return; }
    if (!dlg) return;
    buildDialog();
    if (typeof dlg.showModal === 'function') dlg.showModal();
    else dlg.setAttribute('open', '');
  }

  buildDialog();

  var triggers = document.querySelectorAll('[data-get-started]');
  for (var ti = 0; ti < triggers.length; ti++) {
    triggers[ti].addEventListener('click', openDialog);
  }

  if (dlg) {
    dlg.addEventListener('click', function (e) {
      /* The dialog is full-bleed, so the native ::backdrop is not the hit
         target. Dismiss on any click outside the heading / QR / instruction. */
      var body = dlg.querySelector('[data-role="download-body"]');
      if (body && body.contains(e.target)) return;
      dlg.close();
    });
    dlg.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && dlg.open) dlg.close();
    });
  }

  /* ═══════════════════════════════════════════════════════════════════════
   * 2b. Contact dialog
   *
   * Submissions go to the public send-contact-message Edge Function, which
   * validates them and forwards to the Hachisu support mailbox via Resend.
   * No key is needed here: the endpoint is public and the destination address
   * is fixed server-side.
   * ═══════════════════════════════════════════════════════════════════════ */
  var CONTACT_ENDPOINT =
    'https://alicjprjjephyvbpbimw.supabase.co/functions/v1/send-contact-message';
  var contactDlg = document.getElementById('contact-hachisu');
  var contactForm = contactDlg && contactDlg.querySelector('[data-contact-form]');
  var contactStatus = contactDlg && contactDlg.querySelector('[data-contact-status]');

  function openContact() {
    if (!contactDlg) return;
    if (contactStatus) {
      contactStatus.hidden = true;
      contactStatus.textContent = '';
    }
    if (typeof contactDlg.showModal === 'function') contactDlg.showModal();
    else contactDlg.setAttribute('open', '');
    var emailField = document.getElementById('contact-email');
    if (emailField) emailField.focus();
  }

  var contactTriggers = document.querySelectorAll('[data-contact]');
  for (var ci = 0; ci < contactTriggers.length; ci++) {
    contactTriggers[ci].addEventListener('click', openContact);
  }

  /* https://hachisu.io/#contact is the canonical Contact destination — it is
     what the legal pages link to. Arriving with (or navigating to) that hash
     opens the same contact dialog the footer button does. */
  function openContactFromHash() {
    if (window.location.hash === '#contact') openContact();
  }
  window.addEventListener('hashchange', openContactFromHash);
  openContactFromHash();

  if (contactDlg) {
    contactDlg.addEventListener('click', function (e) {
      if (e.target === contactDlg) contactDlg.close();
    });
    var contactClose = contactDlg.querySelector('[data-close]');
    if (contactClose) contactClose.addEventListener('click', function () { contactDlg.close(); });
    contactDlg.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && contactDlg.open) contactDlg.close();
    });
    contactDlg.addEventListener('close', function () {
      if (contactForm) contactForm.reset();
      if (contactStatus) {
        contactStatus.hidden = true;
        contactStatus.textContent = '';
      }
    });
  }

  if (contactForm) {
    var contactSending = false;

    var showContactStatus = function (text) {
      if (!contactStatus) return;
      contactStatus.hidden = false;
      contactStatus.textContent = text;
    };

    contactForm.addEventListener('submit', function (e) {
      e.preventDefault();
      if (contactSending) return; /* one request in flight at a time */
      if (!contactForm.reportValidity()) return;

      var emailField = contactForm.querySelector('[name="email"]');
      var messageField = contactForm.querySelector('[name="message"]');
      var sendButton = contactForm.querySelector('.contact-send');

      contactSending = true;
      if (sendButton) sendButton.disabled = true;
      showContactStatus('Sending…');

      fetch(CONTACT_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: emailField ? emailField.value : '',
          message: messageField ? messageField.value : '',
        }),
      })
        .then(function (res) {
          return res
            .json()
            .catch(function () { return {}; })
            .then(function (payload) { return { ok: res.ok && payload.ok === true, payload: payload }; });
        })
        .then(function (result) {
          if (result.ok) {
            contactForm.reset();
            showContactStatus('Message sent.');
          } else {
            /* The function's errors are already written for people. */
            showContactStatus(
              (result.payload && typeof result.payload.error === 'string')
                ? result.payload.error
                : 'The message could not be sent. Please try again.'
            );
          }
        })
        .catch(function () {
          showContactStatus('The message could not be sent. Please try again.');
        })
        .then(function () {
          contactSending = false;
          if (sendButton) sendButton.disabled = false;
        });
    });
  }

  /* ═══════════════════════════════════════════════════════════════════════
   * 3. Type-shuffle reveals.
   *
   * The hero shuffle retains its original load behavior. Effect 3 reveals
   * use semantic source text plus an aria-hidden visual layer and run once
   * when their content first enters the viewport.
   * ═══════════════════════════════════════════════════════════════════════ */
  var SHUFFLE_GLYPHS = '#$%&*+-/<=>?@[]^_{}~0123456789';

  function shuffleReveal(el, delay) {
    var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
    var nodes = [], node;
    while ((node = walker.nextNode())) if (node.nodeValue.trim()) nodes.push(node);
    if (!nodes.length) return;

    var originals = nodes.map(function (n) { return n.nodeValue; });
    var total = originals.reduce(function (a, s) { return a + s.length; }, 0);
    var start = 0, settleFor = 260, stagger = 380;

    function frame(now) {
      if (!start) start = now;
      var t = now - start;
      var done = true, seen = 0;
      for (var i = 0; i < nodes.length; i++) {
        var src = originals[i], out = '';
        for (var k = 0; k < src.length; k++) {
          var ch = src[k];
          var at = (seen + k) / Math.max(1, total - 1);
          var began = at * stagger;
          if (ch === ' ' || t >= began + settleFor) { out += ch; }
          else if (t < began) { out += ' '; done = false; }
          else { out += SHUFFLE_GLYPHS[(Math.random() * SHUFFLE_GLYPHS.length) | 0]; done = false; }
        }
        seen += src.length;
        nodes[i].nodeValue = out;
      }
      if (!done) requestAnimationFrame(frame);
      else for (var j = 0; j < nodes.length; j++) nodes[j].nodeValue = originals[j];
    }

    window.setTimeout(function () { requestAnimationFrame(frame); }, delay);
    /* Failsafe: if rAF never runs (backgrounded tab, throttling), the real text
       must still be on screen rather than a frozen field of noise. */
    window.setTimeout(function () {
      for (var j = 0; j < nodes.length; j++) nodes[j].nodeValue = originals[j];
    }, delay + stagger + settleFor + 600);
  }

  /* Effect 3 adaptation: each cell starts at a short random offset, cycles
     independently, then resolves. The original semantic text stays in place;
     only an aria-hidden presentation layer receives shuffled characters. */
  function prepareShuffleTarget(element) {
    var textNode = null;
    for (var i = 0; i < element.childNodes.length; i++) {
      var candidate = element.childNodes[i];
      if (candidate.nodeType === Node.TEXT_NODE && candidate.nodeValue.trim()) {
        textNode = candidate;
        break;
      }
    }
    if (!textNode) return null;

    var source = document.createElement('span');
    source.className = 'shuffle-source';
    source.textContent = textNode.nodeValue;

    var visual = document.createElement('span');
    visual.className = 'shuffle-visual';
    visual.setAttribute('aria-hidden', 'true');

    element.replaceChild(source, textNode);
    element.appendChild(visual);
    element.classList.add('shuffle-target');

    return {
      element: element,
      source: source,
      visual: visual,
      finalText: source.textContent,
    };
  }

  function prepareWrappedShuffleTargets(element) {
    var textNode = null;
    for (var i = 0; i < element.childNodes.length; i++) {
      var candidate = element.childNodes[i];
      if (candidate.nodeType === Node.TEXT_NODE && candidate.nodeValue.trim()) {
        textNode = candidate;
        break;
      }
    }
    if (!textNode) return [];

    var fragment = document.createDocumentFragment();
    var targets = [];
    var parts = textNode.nodeValue.split(/(\s+)/);

    for (var partIndex = 0; partIndex < parts.length; partIndex++) {
      var part = parts[partIndex];
      if (!part) continue;
      if (!part.trim()) {
        fragment.appendChild(document.createTextNode(part));
        continue;
      }

      var word = document.createElement('span');
      word.className = 'shuffle-target shuffle-word';

      var source = document.createElement('span');
      source.className = 'shuffle-source';
      source.textContent = part;

      var visual = document.createElement('span');
      visual.className = 'shuffle-visual';
      visual.setAttribute('aria-hidden', 'true');

      word.appendChild(source);
      word.appendChild(visual);
      fragment.appendChild(word);
      targets.push({
        element: word,
        source: source,
        visual: visual,
        finalText: part,
      });
    }

    element.replaceChild(fragment, textNode);
    return targets;
  }

  function shuffleRevealEffect3(target, delay, options) {
    options = options || {};
    var iterations = options.iterations || 7;
    var iterationTime = options.iterationTime || 42;
    var randomStartRange = options.randomStartRange || 160;
    var cells = target.finalText.split('').map(function (character) {
      return {
        character: character,
        current: character.trim() ? '\u00a0' : character,
        iteration: -1,
        startsAt: Math.random() * randomStartRange,
      };
    });

    target.element.classList.add('is-shuffling');
    target.visual.textContent = cells.map(function (cell) { return cell.current; }).join('');

    window.setTimeout(function () {
      var startedAt = 0;

      function frame(now) {
        if (!startedAt) startedAt = now;
        var elapsed = now - startedAt;
        var isComplete = true;

        for (var index = 0; index < cells.length; index++) {
          var cell = cells[index];
          if (!cell.character.trim()) continue;

          if (elapsed < cell.startsAt) {
            isComplete = false;
            continue;
          }

          var iteration = Math.floor((elapsed - cell.startsAt) / iterationTime);
          if (iteration >= iterations - 1) {
            cell.current = cell.character;
            continue;
          }

          isComplete = false;
          if (iteration !== cell.iteration) {
            cell.iteration = iteration;
            cell.current = SHUFFLE_GLYPHS[(Math.random() * SHUFFLE_GLYPHS.length) | 0];
          }
        }

        target.visual.textContent = cells.map(function (cell) { return cell.current; }).join('');
        if (!isComplete) {
          window.requestAnimationFrame(frame);
          return;
        }

        target.visual.textContent = '';
        target.element.classList.remove('is-shuffling');
      }

      window.requestAnimationFrame(frame);
    }, delay);

    window.setTimeout(function () {
      target.visual.textContent = '';
      target.element.classList.remove('is-shuffling');
    }, delay + randomStartRange + iterations * iterationTime + 500);
  }

  function initViewportEffect3(element, options) {
    if (!element) return;

    var targets = prepareWrappedShuffleTargets(element);
    if (!targets.length) return;

    function trigger() {
      for (var index = 0; index < targets.length; index++) {
        shuffleRevealEffect3(targets[index], 0, options);
      }
    }

    if (!('IntersectionObserver' in window)) {
      trigger();
      return;
    }

    var observer = new IntersectionObserver(function (entries) {
      if (!entries[0].isIntersecting) return;
      observer.disconnect();
      trigger();
    }, { threshold: options.threshold });
    observer.observe(element);
  }

  function initHeroBitcoinShuffle() {
    var heading = document.querySelector('.hero h1');
    if (!heading) return;

    var textNode = heading.firstChild;
    if (!textNode || textNode.nodeType !== Node.TEXT_NODE) return;
    if (textNode.nodeValue.indexOf('Bitcoin') !== 0) return;

    var rest = textNode.nodeValue.slice('Bitcoin'.length);
    var word = document.createElement('span');
    word.textContent = 'Bitcoin';
    heading.replaceChild(word, textNode);
    if (rest) heading.insertBefore(document.createTextNode(rest), word.nextSibling);

    var target = prepareShuffleTarget(word);
    if (!target) return;
    /* Hero is already in view on load — fire once immediately rather than
       waiting on intersection, which can miss a newly wrapped inline word. */
    shuffleRevealEffect3(target, 0, {
      iterations: 5,
      iterationTime: 30,
      randomStartRange: 48,
    });
  }

  function initTechnicalGridShuffle() {
    var grid = document.querySelector('dl.strip');
    if (!grid) return;

    var groups = Array.from(grid.children).map(function (item) {
      var label = item.querySelector('dt');
      var legalTrigger = item.querySelector('.legal-menu summary');
      var value = legalTrigger || item.querySelector('dd .on') || item.querySelector('dd');
      return [prepareShuffleTarget(label), prepareShuffleTarget(value)].filter(Boolean);
    });

    function trigger() {
      for (var index = 0; index < groups.length; index++) {
        for (var targetIndex = 0; targetIndex < groups[index].length; targetIndex++) {
          shuffleRevealEffect3(groups[index][targetIndex], index * 65);
        }
      }
    }

    if (!('IntersectionObserver' in window)) {
      trigger();
      return;
    }

    var observer = new IntersectionObserver(function (entries) {
      if (!entries[0].isIntersecting) return;
      observer.disconnect();
      trigger();
    }, { threshold: 0.35 });
    observer.observe(grid);
  }

  if (!reduceMotion) {
    var shufflers = document.querySelectorAll('[data-shuffle]');
    for (var si = 0; si < shufflers.length; si++) shuffleReveal(shufflers[si], 90 + si * 110);
    initHeroBitcoinShuffle();
    initViewportEffect3(document.querySelector('.foot-note strong'), {
      iterations: 8,
      iterationTime: 48,
      randomStartRange: 260,
      threshold: 0.35,
    });
    initViewportEffect3(document.querySelector('.why h2'), {
      iterations: 6,
      iterationTime: 36,
      randomStartRange: 100,
      threshold: 0.5,
    });
    initTechnicalGridShuffle();
  }


})();
