// Manual verification harness for lib/send/{sha256,destination}.ts.
//
// There is no test runner in this project, so this script copies the REAL
// source into a temp dir (rewriting only the "@/" import to a relative path —
// Node 22.6+ strips TS types natively) and runs it against published test
// vectors: FIPS 180-4 SHA-256 vectors, BIP173/BIP350 address vectors, and
// base58check known-good/known-bad addresses. Run manually:
//
//   node scripts/verify-send-parsing.mjs
//
// Exit code 0 = all vectors pass.

import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const tmp = mkdtempSync(join(tmpdir(), 'send-parse-'));

writeFileSync(join(tmp, 'sha256.ts'), readFileSync(join(root, 'lib/send/sha256.ts'), 'utf8'));
writeFileSync(
  join(tmp, 'destination.ts'),
  readFileSync(join(root, 'lib/send/destination.ts'), 'utf8')
    .replace("@/lib/send/sha256", './sha256.ts'),
);

const { sha256 } = await import(pathToFileURL(join(tmp, 'sha256.ts')));
const dest = await import(pathToFileURL(join(tmp, 'destination.ts')));


let failures = 0;
function check(name, actual, expected) {
  const okC = JSON.stringify(actual) === JSON.stringify(expected);
  if (!okC) {
    failures++;
    console.log(`FAIL ${name}: got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`);
  } else {
    console.log(`ok   ${name}`);
  }
}

// --- SHA-256 vectors (FIPS 180-4) + random cross-check vs node:crypto ---
const hex = (u8) => Buffer.from(u8).toString('hex');
check('sha256("")', hex(sha256(new Uint8Array())),
  'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
check('sha256("abc")', hex(sha256(new TextEncoder().encode('abc'))),
  'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
check('sha256(448-bit msg)', hex(sha256(new TextEncoder().encode(
  'abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq'))),
  '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1');
for (let i = 0; i < 50; i++) {
  const len = Math.floor(Math.random() * 300);
  const buf = new Uint8Array(len);
  for (let j = 0; j < len; j++) buf[j] = Math.floor(Math.random() * 256);
  const want = createHash('sha256').update(buf).digest('hex');
  if (hex(sha256(buf)) !== want) { failures++; console.log(`FAIL sha256 random len=${len}`); }
}
console.log('ok   sha256 50 random cross-checks vs node:crypto');

// --- Address classification ---
const A = dest.classifyBitcoinAddress;
// BIP173/BIP350 valid vectors
check('P2WPKH v0', A('BC1QW508D6QEJXTDG4Y5R3ZARVARY0C5XW7KV8F3T4'), 'mainnet');
check('P2WSH v0', A('bc1qrp33g0q5c5txsp9arysrx4k6zdkfs4nce4xj0gdcccefvpysxf3qccfmv3'), 'mainnet');
check('P2TR v1 (bech32m)', A('bc1p5d7rjq7g6rdk2yhzks9smlaqtedr4dekq08ge8ztwac72sfr9rusxg3297'), 'mainnet');
check('BIP350 v1 vector', A('bc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vqzk5jj0'), 'mainnet');
check('testnet P2WPKH', A('tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx'), 'testnet');
check('regtest', A('bcrt1qw508d6qejxtdg4y5r3zarvary0c5xw7kygt080'), 'regtest');
// Invalid bech32 vectors
check('v1 with bech32 (invalid)', A('bc1p5d7rjq7g6rdk2yhzks9smlaqtedr4dekq08ge8ztwac72sfr9rusxg3296'), null);
check('mixed case', A('bc1QW508D6QEJXTDG4Y5R3ZARVARY0C5XW7KV8F3T4'), null);
check('bad checksum', A('bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t5'), null);
check('v0 wrong length', A('BC1QR508D6QEJXTDG4Y5R3ZARVARYV98GJ9P'), null);
// base58check
check('P2PKH genesis', A('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa'), 'mainnet');
check('P2SH', A('3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy'), 'mainnet');
check('P2PKH typo', A('1A1zP1eP5QGefi2DMPTfTL5SLmv7Divfna'), null);
check('testnet P2PKH', A('mipcBbFg9gMiCh81Kj8tqqdgoZub1ZJRfn'), 'testnet');
check('garbage', A('hello world'), null);
check('empty', A(''), null);

// --- Amount parsing ---
const P = dest.parseBtcAmountToSats;
check('amount 0.001', P('0.001'), 100000);
check('amount 1', P('1'), 100000000);
check('amount 0.00000001', P('0.00000001'), 1);
check('amount 20999999.9769', P('20999999.9769'), 2099999997690000);
check('amount 9 decimals', P('0.000000001'), null);
check('amount 0', P('0'), null);
check('amount neg', P('-1'), null);
check('amount junk', P('1,5'), null);
check('amount empty', P(''), null);

// --- Full payload parsing ---
const S = dest.parseSendDestination;
const addr = 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4';
check('raw address', S(addr), { ok: true, destination: { address: addr, amountSats: null, label: null, bip21Uri: null } });
check('uppercase bech32 normalized', S(addr.toUpperCase()).destination?.address, addr);
check('bip21 basic', S(`bitcoin:${addr}?amount=0.001`), {
  ok: true, destination: { address: addr, amountSats: 100000, label: null, bip21Uri: `bitcoin:${addr}?amount=0.001` } });
check('bip21 label+message', S(`bitcoin:${addr}?label=Luke%2DJr&message=Donation`).destination?.label, 'Luke-Jr');
check('bip21 uppercase scheme', S(`BITCOIN:${addr}?amount=0.5`).destination?.amountSats, 50000000);
check('bip21 req- param rejected', S(`bitcoin:${addr}?req-somethingyoudontunderstand=50`).code, 'UNRECOGNIZED');
check('bip21 bad amount', S(`bitcoin:${addr}?amount=abc`).code, 'INVALID_BIP21');
check('bip21 unified lightning kept onchain', S(`bitcoin:${addr}?lightning=lnbc123abcdefghjklmn`).ok, true);
check('bip21 lightning-only', S('bitcoin:?lightning=lnbc10u1pjqqqqqqqqqqqqqqqqqqqqqq').code, 'LIGHTNING_UNSUPPORTED');
check('bolt11 rejected', S('lnbc2500u1pvjluezsp5zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zygspp5qqqsyq'), { ok: false, code: 'LIGHTNING_UNSUPPORTED', message: 'This is a Lightning payment code. Hachisu can only send on-chain bitcoin right now.' });
check('lightning: uri rejected', S('lightning:lnbc1abc').code, 'LIGHTNING_UNSUPPORTED');
check('lnurl rejected', S('LNURL1DP68GURN8GHJ7UM9WFMXJCM99E3K7MF0V9CXJ0M385EKVCENXC6R2C35XVUKXEFCV5MKVV34X5EKZD3EV56NYD3HXQURZEPEXEJXXEPNXSCRVWFNV9NXZCN9XQ6XYEFHVGCXXCMYXYMNSERXFQ5FNS').code, 'LIGHTNING_UNSUPPORTED');
check('testnet rejected', S('tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx').code, 'WRONG_NETWORK');
check('empty', S('').code, 'EMPTY');
check('whitespace', S('   ').code, 'EMPTY');
check('random text', S('the quick brown fox').code, 'UNRECOGNIZED');
check('near-address typo', S('bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t9').code, 'INVALID_ADDRESS');

console.log(failures === 0 ? '\nALL VECTORS PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
