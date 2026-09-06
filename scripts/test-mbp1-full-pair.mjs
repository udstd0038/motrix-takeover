// Full MBP1 first-pair client + MDXP E2E harness (Node).
// Mirrors the official extension implementation (@noble/curves 2.4.0 /
// @noble/hashes 2.4.0, WebCrypto AES-256-GCM) and validates itself against the
// normative vectors in src/background/mbp1/__fixtures__/mbp1-vectors.json
// BEFORE touching the network.
//
// Usage:
//   node scripts/test-mbp1-full-pair.mjs vectors          # offline self-check only
//   CODE=XXXX-XXXX node scripts/test-mbp1-full-pair.mjs   # live pairing + MDXP + download
//   HOLD=1 CODE=XXXX-XXXX node ...                        # keep connection open after pairing
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import { readFile } from 'node:fs/promises';
import WebSocket from 'ws';
import { ed25519 } from '@noble/curves/ed25519.js';
import { hkdf } from '@noble/hashes/hkdf.js';
import { hmac } from '@noble/hashes/hmac.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { scrypt } from '@noble/hashes/scrypt.js';

// ---------------------------------------------------------------- canonical
const te = new TextEncoder();
const utf8 = (s) => te.encode(s);
const hex = (b) => Buffer.from(b).toString('hex');
const fromHex = (s) => new Uint8Array(Buffer.from(s, 'hex'));
const concat = (...parts) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0; for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
};
const len64LE = (n) => { const b = new Uint8Array(8); new DataView(b.buffer).setBigUint64(0, BigInt(n), true); return b; };
const encU32BE = (n) => { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, n, false); return b; };
const encU64BE = (n) => { const b = new Uint8Array(8); new DataView(b.buffer).setBigUint64(0, BigInt(n), false); return b; };
const assertAscii = (s, f) => { const b = utf8(s); if (b.some((x) => x >= 0x80)) throw new Error(`${f} must be ASCII`); return b; };
const enc = (s) => typeof s === 'string' ? concat(len64LE(assertAscii(s).length), assertAscii(s)) : concat(len64LE(s.length), s);
const b64u = (b) => Buffer.from(b).toString('base64url');
const b64uDecode = (s) => new Uint8Array(Buffer.from(s, 'base64url'));
const timingSafeEqual = (a, b) => {
  const n = Math.max(a.length, b.length);
  let d = a.length === b.length ? 0 : 1;
  for (let i = 0; i < n; i++) d |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return d === 0;
};

// ------------------------------------------------------------------- group
const ORDER = ed25519.Point.Fn.ORDER;
const M = fromHex('d048032c6ea0b6d697ddc2e86bda85a33adac920f1bf18e1b0c6d166a5cecdaf');
const N = fromHex('d3bfb518f44f3430f29d0c92af503865a1ed3281dc69b35dd868ba85f886c4ab');
const pt = (b) => ed25519.Point.fromBytes(b);
const bytes = (p) => p.toBytes();
const mul = (b, s) => bytes(pt(b).multiply(s));
const add = (a, b) => bytes(pt(a).add(pt(b)));
const neg = (p) => bytes(pt(p).negate());
function drawScalar(rng = crypto.randomBytes) {
  for (;;) {
    const b = rng(32);
    let n = 0n; for (const x of b) n = (n << 8n) | BigInt(x);
    if (n !== 0n && n < ORDER) return n;
  }
}
const os2ip = (b) => { let n = 0n; for (const x of b) n = (n << 8n) | BigInt(x); return n; };
const i2osp32 = (w) => { const o = new Uint8Array(32); let v = w; for (let i = 31; i >= 0; i--) { o[i] = Number(v & 0xffn); v >>= 8n; } return o; };

// --------------------------------------------------------- SPAKE2 + scrypt
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
function normalizeCode(input) {
  const upper = input.replace(/[- ]/g, '').toUpperCase();
  let m = '';
  for (const c of upper) m += ({ O: '0', I: '1', L: '1' })[c] ?? c;
  if (m.length !== 8) return null;
  if ([...m].some((c) => !CROCKFORD.includes(c))) return null;
  return m;
}
function deriveW(codeNormalized, pairNonce) {
  const pw = assertAscii(codeNormalized, 'code'); assertAscii(pairNonce, 'nonce');
  const h = scrypt(pw, concat(utf8('MBP1/w/v1'), utf8(pairNonce)), { N: 2 ** 14, r: 8, p: 1, dkLen: 64 });
  const w = os2ip(h) % ORDER;
  if (w === 0n) throw new Error('w == 0');
  return w;
}
function keySchedule(aId, bId, pA, pB, K, w, aad) {
  const TT = concat(enc(aId), enc(bId), enc(pA), enc(pB), enc(K), enc(i2osp32(w)));
  const digest = sha256(TT);
  const Ke = digest.slice(0, 16), Ka = digest.slice(16, 32);
  const ck = hkdf(sha256, Ka, new Uint8Array(0), concat(utf8('ConfirmationKeys'), aad), 32);
  const KcA = ck.slice(0, 16), KcB = ck.slice(16, 32);
  return { TT, Ke, Ka, KcA, KcB, cA: hmac(sha256, KcA, TT), cB: hmac(sha256, KcB, TT) };
}
function spake2ClientRun(aId, bId, w, x, pB, aad) {
  const pA = add(mul(M, w), bytes(ed25519.Point.BASE.multiply(x)));
  const d = add(pB, neg(mul(N, w)));
  const K = bytes(pt(d).multiply(x).multiplyUnsafe(8n));
  if (pt(K).is0()) throw new Error('K is identity');
  return { pA, K, ...keySchedule(aId, bId, pA, pB, K, w, aad) };
}
function buildAId({ browser, verifiedOrigin, claimedExtensionId, clientInstallationId }) {
  return concat(enc('MBP1/A/v1'), enc(browser), enc(verifiedOrigin), enc(claimedExtensionId), enc(clientInstallationId));
}
const buildBId = (instanceId) => concat(enc('MBP1/B/v1'), enc('motrix-bridge'), enc(instanceId));
function ticketDigest(t) {
  return sha256(concat(encU32BE(t.v), enc(t.purpose), encU32BE(t.protocolVersion), enc(t.serverGeneration), enc(t.browser), enc(t.callerId), encU64BE(t.exp), enc(t.bindingPub), enc(t.mac)));
}
function buildAad(protocolVersion, pairNonce, ticketBindingKey, ticket) {
  return concat(encU32BE(protocolVersion), enc(pairNonce), enc(ticketBindingKey ?? new Uint8Array(0)), enc(ticket ? ticketDigest(ticket) : new Uint8Array(0)));
}
const pairTrafficKeys = (Ke) => ({
  c2s: hkdf(sha256, Ke, utf8('MBP1/pair/v1'), utf8('MBP1-pair-traffic-c2s'), 32),
  s2c: hkdf(sha256, Ke, utf8('MBP1/pair/v1'), utf8('MBP1-pair-traffic-s2c'), 32),
});

// ----------------------------------------------------------------- envelope
class EnvelopeCodec {
  constructor(keyOut, keyIn, dirTagOut, dirTagIn) { this.keyOut = keyOut; this.keyIn = keyIn; this.dirTagOut = dirTagOut; this.dirTagIn = dirTagIn; this.seqOut = 0; this.seqIn = 0; }
  static async create(kC2S, kS2C, role) {
    const imp = (raw) => crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
    return role === 'client'
      ? new EnvelopeCodec(await imp(kC2S), await imp(kS2C), 0x00000001, 0x00000002)
      : new EnvelopeCodec(await imp(kS2C), await imp(kC2S), 0x00000002, 0x00000001);
  }
  async seal(pt) {
    const seq = encU64BE(this.seqOut);
    const nonce = concat(encU32BE(this.dirTagOut), seq);
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce, additionalData: utf8('MBP1/env/v1'), tagLength: 128 }, this.keyOut, pt));
    this.seqOut++;
    return concat(seq, ct);
  }
  async open(frame) {
    const seq = frame.slice(0, 8), ct = frame.slice(8);
    const expect = encU64BE(this.seqIn);
    if (!timingSafeEqual(seq, expect)) throw new Error('seq mismatch');
    const nonce = concat(encU32BE(this.dirTagIn), seq);
    try {
      const pt = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce, additionalData: utf8('MBP1/env/v1'), tagLength: 128 }, this.keyIn, ct));
      this.seqIn++;
      return pt;
    } catch { throw new Error('gcm auth failure'); }
  }
}

// ------------------------------------------------------------- NM bootstrap
const HOST = 'D:\\Program Files\\Motrix\\resources\\bin\\motrix-native-host.exe';
const MANIFEST = process.env.APPDATA + '\\Motrix\\bridge\\manifests\\firefox-takeover.json';
const EXT_ID = 'motrix-takeover@local.dev';
function frameJson(o) { const b = Buffer.from(JSON.stringify(o)); const f = Buffer.alloc(4 + b.length); f.writeUInt32LE(b.length); b.copy(f, 4); return f; }
function runHost(args, frame) {
  return new Promise((res, rej) => {
    const c = spawn(HOST, args, { stdio: ['pipe', 'pipe', 'inherit'] });
    const chunks = [];
    c.stdout.on('data', (d) => chunks.push(d));
    c.on('error', rej);
    c.on('close', (code) => {
      const out = Buffer.concat(chunks);
      if (code !== 0 || out.length < 4) return rej(new Error('host failed code=' + code));
      res(JSON.parse(out.subarray(4, 4 + out.readUInt32LE(0))));
    });
    c.stdin.write(frame); c.stdin.end();
  });
}

// ----------------------------------------------------------- vector checks
async function runVectors() {
  const v = JSON.parse(await readFile(new URL('./../src/background/mbp1/__fixtures__/mbp1-vectors.json', import.meta.url), 'utf8'));
  // scryptW
  const sw = v.scryptW;
  const h = scrypt(utf8(sw.inputs.codeNormalized), concat(utf8('MBP1/w/v1'), utf8(sw.inputs.pairNonce)), { N: sw.inputs.params.N, r: sw.inputs.params.r, p: sw.inputs.params.p, dkLen: sw.inputs.params.dkLen });
  if (hex(h) !== sw.expected.scryptOutput) throw new Error('scryptW output mismatch');
  if (hex(i2osp32(os2ip(h) % ORDER)) !== sw.expected.w) throw new Error('scryptW w mismatch');
  console.log('vectors: scryptW OK');
  // spake2 vector 0
  const s = v.spake2[0];
  const w = os2ip(fromHex(s.intermediate.w));
  const aId = fromHex(s.intermediate.aId), bId = fromHex(s.intermediate.bId);
  const aad = fromHex(s.intermediate.aad);
  const r = spake2ClientRun(aId, bId, w, BigInt('0x' + s.inputs.x), fromHex(s.expected.pB), aad);
  if (hex(r.pA) !== s.expected.pA) throw new Error('pA mismatch');
  if (hex(r.K) !== s.expected.K) throw new Error('K mismatch');
  if (hex(r.TT) !== s.expected.TT) throw new Error('TT mismatch');
  if (hex(r.Ke) !== s.expected.Ke || hex(r.Ka) !== s.expected.Ka) throw new Error('Ke/Ka mismatch');
  if (hex(r.KcA) !== s.expected.KcA || hex(r.KcB) !== s.expected.KcB) throw new Error('KcA/KcB mismatch');
  if (hex(r.cA) !== s.expected.cA || hex(r.cB) !== s.expected.cB) throw new Error('cA/cB mismatch');
  const tk = pairTrafficKeys(r.Ke);
  if (hex(tk.c2s) !== s.expected.trafficC2S || hex(tk.s2c) !== s.expected.trafficS2C) throw new Error('traffic keys mismatch');
  // ticketProof: fixture's bindingSeed is the Ed25519 seed; derive keypair and sign
  const seed = fromHex(s.inputs.bindingSeed);
  const publicKey = ed25519.getPublicKey(seed.slice(0, 32));
  if (hex(publicKey) !== s.intermediate.bindingPub) throw new Error('bindingPub mismatch');
  const proof = ed25519.sign(concat(utf8('MBP1/ticket-proof/v1'), r.TT), seed.slice(0, 32));
  if (hex(proof) !== s.expected.ticketProof) throw new Error('ticketProof mismatch');
  console.log('vectors: spake2 + ticketProof OK');
  // envelope
  const e = v.envelope;
  const codec = await EnvelopeCodec.create(fromHex(e.inputs.keyC2S), fromHex(e.inputs.keyS2C), 'client');
  const f0 = await codec.seal(fromHex(e.inputs.plaintext0));
  if (hex(f0) !== e.expected.frameC2S_seq0) throw new Error('envelope frame0 mismatch');
  const f1 = await codec.seal(fromHex(e.inputs.plaintext1));
  if (hex(f1) !== e.expected.frameC2S_seq1) throw new Error('envelope frame1 mismatch');
  const openCodec = await EnvelopeCodec.create(fromHex(e.inputs.keyC2S), fromHex(e.inputs.keyS2C), 'server');
  const pt = await openCodec.open(fromHex(e.expected.frameC2S_seq0));
  if (hex(pt) !== e.inputs.plaintext0) throw new Error('envelope open mismatch');
  const s2c = await EnvelopeCodec.create(fromHex(e.inputs.keyC2S), fromHex(e.inputs.keyS2C), 'client');
  const ptS2C = await s2c.open(fromHex(e.expected.frameS2C_seq0));
  if (hex(ptS2C) !== e.inputs.plaintext1) throw new Error('envelope s2c open mismatch');
  console.log('vectors: envelope OK');
}

// ------------------------------------------------------------------- live
async function livePair(codeRaw) {
  const originHost = crypto.randomUUID();
  const verifiedOrigin = `moz-extension://${originHost}`;
  const clientInstallationId = crypto.randomUUID();

  // 1. NM bootstrap (fresh binding keypair)
  const seed = crypto.randomBytes(32);
  const bindingPub = ed25519.getPublicKey(seed);
  const bindingPriv = seed;
  const boot = await runHost([MANIFEST, EXT_ID], frameJson({ action: 'bootstrap', protocolVersion: 1, bindingPub: b64u(bindingPub), allowLaunch: false }));
  if (boot.action !== 'requestPair' || !boot.nonce || !boot.nmTicket) throw new Error('bad bootstrap: ' + JSON.stringify(boot).slice(0, 200));
  console.log('[1/8] bootstrap OK, port', boot.port);

  // 2. /pair
  const ws = new WebSocket(`ws://127.0.0.1:${boot.port}/pair?nonce=${encodeURIComponent(boot.nonce)}`, ['motrix-bridge.v1'], { origin: verifiedOrigin });
  await new Promise((res, rej) => { ws.on('open', res); ws.on('error', rej); });
  const sendText = (o) => ws.send(JSON.stringify(o));
  const nextText = (timeoutMs = 30000) => new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('timeout waiting frame')), timeoutMs);
    ws.once('message', (d, isBinary) => { clearTimeout(t); if (isBinary) return rej(new Error('binary before channel')); res(JSON.parse(d.toString())); });
  });

  const parsedTicket = {
    v: boot.nmTicket.v,
    purpose: boot.nmTicket.purpose,
    protocolVersion: boot.nmTicket.protocolVersion,
    serverGeneration: boot.nmTicket.serverGeneration,
    browser: boot.nmTicket.browser,
    callerId: boot.nmTicket.callerId,
    exp: boot.nmTicket.exp,
    bindingPub: b64uDecode(boot.nmTicket.bindingPub),
    mac: b64uDecode(boot.nmTicket.mac),
  };
  sendText({ type: 'pairHello', protocolVersion: 1, browser: 'firefox', claimedExtensionId: EXT_ID, clientInstallationId, nmTicket: boot.nmTicket, ticketBindingKey: b64u(bindingPub) });
  const accept = await nextText();
  if (accept.type !== 'pairAccept') throw new Error('expected pairAccept, got ' + JSON.stringify(accept).slice(0, 200));
  console.log('[2/8] pairAccept, instanceId', accept.instanceId);

  // Optional hold: wait for the code via env CODE, or poll CODE_FILE (a file
  // the orchestrator writes) while the approval dialog stays live.
  let code = normalizeCode(codeRaw);
  if (code === null) {
    const file = process.env.CODE_FILE;
    console.log('AWAITING-CODE: dialog is live, waiting for', file ?? 'CODE env');
    const deadline = Date.now() + 100000;
    const { readFileSync, existsSync, rmSync } = await import('node:fs');
    for (;;) {
      if (existsSync(file)) {
        code = normalizeCode(readFileSync(file, 'utf8').trim());
        rmSync(file, { force: true });
        break;
      }
      if (Date.now() > deadline) throw new Error('timed out waiting for pairing code');
      await new Promise((r) => setTimeout(r, 400));
    }
    if (!code) throw new Error('invalid code from file');
  }

  // 3. PAKE
  const w = deriveW(code, boot.nonce);
  const x = drawScalar();
  const aId = buildAId({ browser: 'firefox', verifiedOrigin, claimedExtensionId: EXT_ID, clientInstallationId });
  const bId = buildBId(accept.instanceId);
  const aad = buildAad(1, boot.nonce, bindingPub, parsedTicket);
  const share = add(mul(M, w), bytes(ed25519.Point.BASE.multiply(x)));
  sendText({ type: 'pakeA', pA: b64u(share) });
  const pakeB = await nextText();
  if (pakeB.type !== 'pakeB') throw new Error('expected pakeB, got ' + JSON.stringify(pakeB).slice(0, 200));
  const run = spake2ClientRun(aId, bId, w, x, b64uDecode(pakeB.pB), aad);
  const proof = ed25519.sign(concat(utf8('MBP1/ticket-proof/v1'), run.TT), bindingPriv);
  sendText({ type: 'confirmA', cA: b64u(run.cA), ticketProof: b64u(proof) });
  const confirmB = await nextText();
  if (confirmB.type !== 'confirmB') throw new Error('expected confirmB, got ' + JSON.stringify(confirmB).slice(0, 200));
  if (!timingSafeEqual(b64uDecode(confirmB.cB), run.cB)) throw new Error('confirmB verify FAILED');
  console.log('[3/8] PAKE confirmed (mutual key confirmation)');

  // 4. AEAD channel + credential commit
  const env = await EnvelopeCodec.create(pairTrafficKeys(run.Ke).c2s, pairTrafficKeys(run.Ke).s2c, 'client');
  const sendEnv = async (o) => ws.send(await env.seal(utf8(JSON.stringify(o))));
  const recvEnv = () => new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('envelope timeout')), 30000);
    ws.once('message', async (d, isBinary) => { clearTimeout(t); if (!isBinary) return rej(new Error('text inside channel')); res(JSON.parse(new TextDecoder().decode(await env.open(new Uint8Array(d))))); });
  });
  const offer = await recvEnv();
  if (offer.type !== 'credentialOffer') throw new Error('expected credentialOffer, got ' + JSON.stringify(offer).slice(0, 160));
  console.log('[4/8] credentialOffer', offer.credentialId);
  await sendEnv({ type: 'credentialAck', credentialId: offer.credentialId });
  const committed = await recvEnv();
  if (committed.type !== 'credentialCommitted') throw new Error('expected credentialCommitted');
  console.log('[5/8] credential committed');

  // 5. MDXP initialize
  const rpcId = { n: 0 };
  const rpc = (method, params) => { rpcId.n++; return { jsonrpc: '2.0', id: rpcId.n, method, params }; };
  await sendEnv(rpc('motrix/initialize', {
    protocolVersion: '1.0',
    client: { kind: 'extension', name: 'motrix-takeover-probe', version: '0.1.0', extensionId: EXT_ID, browser: 'firefox', browserVersion: '154.0', locale: 'zh-CN' },
    capabilities: { submitDownload: true, resolveUrl: true, probeUrl: true, cancellation: true, progress: true },
    adapters: [],
  }));
  const initResp = await recvEnv();
  if (initResp.error) throw new Error('initialize error: ' + JSON.stringify(initResp.error));
  console.log('[6/8] MDXP initialize OK, server', initResp.result.server.name, initResp.result.server.version, 'selectionKinds:', (initResp.result.capabilities.selectionKinds || []).join(','));

  // 6. download/submit
  const testUrl = 'https://motrix.app/favicon.ico';
  await sendEnv(rpc('download/submit', {
    source: { pageUrl: 'https://motrix.app/', pageTitle: 'Motrix E2E probe', detectedAt: Date.now() },
    selection: { kind: 'direct', primary: { url: testUrl, headers: {}, cookies: [], refererPolicy: 'strict-origin-when-cross-origin' } },
    meta: { suggestedFilename: 'motrix-e2e-probe.ico', qualityLabel: 'original' },
    idempotencyKey: 'probe-' + clientInstallationId,
  }));
  const submitResp = await recvEnv();
  if (submitResp.error) throw new Error('download/submit error: ' + JSON.stringify(submitResp.error));
  console.log('[7/8] download/submit OK, taskId', submitResp.result.taskId);

  // 7. wait for progress/completion
  const deadline = Date.now() + 120000;
  let lastProgress = null;
  for (;;) {
    const frame = await new Promise((res, rej) => {
      const t = setTimeout(() => rej(new Error('progress timeout')), 30000);
      ws.once('message', async (d, isBinary) => { clearTimeout(t); if (!isBinary) return rej(new Error('text inside channel')); res(JSON.parse(new TextDecoder().decode(await env.open(new Uint8Array(d))))); });
    });
    if (frame.method === '$/task/progress') { lastProgress = frame.params; console.log('   progress:', frame.params.phase, Math.round((frame.params.bytesDone / (frame.params.bytesTotal || 1)) * 100) + '%'); }
    else if (frame.method === '$/task/completed') { console.log('[8/8] task completed ->', frame.params.filePath); return { ws, env, filePath: frame.params.filePath }; }
    else if (frame.method === '$/task/error') { throw new Error('task error: ' + JSON.stringify(frame.params)); }
    if (Date.now() > deadline) throw new Error('deadline, last progress=' + JSON.stringify(lastProgress));
  }
}

(async () => {
  await runVectors();
  const mode = process.argv[2];
  if (mode === 'vectors') { console.log('ALL VECTORS PASS'); process.exit(0); }
  const code = process.env.CODE ?? '';
  const result = await livePair(code);
  console.log('DONE, file:', result.filePath);
  const hold = Number(process.env.HOLD ?? 0);
  if (hold > 0) setTimeout(() => { result.ws.close(); process.exit(0); }, hold);
  else { result.ws.close(); process.exit(0); }
})().catch((e) => { console.log('FAIL:', e.message); process.exit(3); });
