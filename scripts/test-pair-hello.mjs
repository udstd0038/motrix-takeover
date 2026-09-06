// Probe: full MBP1 first-pair handshake up to pairAccept, using a real NM
// attestation ticket minted by Motrix's shipped native host. Proves the whole
// pre-PAKE chain (endpoint -> nonce -> ticket -> /pair admission -> dialog
// queueing) without needing the human-entered pairing code.
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import WebSocket from 'ws';

const HOST = 'D:\\Program Files\\Motrix\\resources\\bin\\motrix-native-host.exe';
const MANIFEST = process.env.APPDATA + '\\Motrix\\bridge\\manifests\\firefox-takeover.json';
const EXT_ID = 'motrix-takeover@local.dev';

function runHost(hostArgs, frame) {
  return new Promise((resolve, reject) => {
    const child = spawn(HOST, hostArgs, { stdio: ['pipe', 'pipe', 'inherit'] });
    const chunks = [];
    child.stdout.on('data', (c) => chunks.push(c));
    child.on('error', reject);
    child.on('close', (code) => {
      const out = Buffer.concat(chunks);
      if (code !== 0 || out.length < 4) return reject(new Error('host failed'));
      const len = out.readUInt32LE(0);
      try { resolve(JSON.parse(out.subarray(4, 4 + len).toString('utf8'))); }
      catch (e) { reject(e); }
    });
    child.stdin.write(frame);
    child.stdin.end();
  });
}

function frameJson(obj) {
  const body = Buffer.from(JSON.stringify(obj), 'utf8');
  const frame = Buffer.alloc(4 + body.length);
  frame.writeUInt32LE(body.length, 0);
  body.copy(frame, 4);
  return frame;
}

(async () => {
  // 1. bootstrap via NM host
  const { publicKey } = crypto.generateKeyPairSync('ed25519');
  const spki = publicKey.export({ format: 'der', type: 'spki' });
  const bindingPub = spki.subarray(spki.length - 32);
  const bindingPubB64 = bindingPub.toString('base64url');

  const boot = await runHost(
    [MANIFEST, EXT_ID],
    frameJson({ action: 'bootstrap', protocolVersion: 1, bindingPub: bindingPubB64, allowLaunch: false })
  );
  console.log('BOOTSTRAP:', JSON.stringify({ port: boot.port, nonce: boot.nonce, hasTicket: !!boot.nmTicket }));
  if (boot.action !== 'requestPair' || !boot.nonce || !boot.nmTicket) {
    console.log('ABORT: bootstrap reply unusable'); process.exit(2);
  }

  // 2. /pair upgrade + pairHello
  const url = `ws://127.0.0.1:${boot.port}/pair?nonce=${encodeURIComponent(boot.nonce)}`;
  // Firefox assigns the add-on a UUID host; the canonical Origin tuple must
  // not contain userinfo (normalizeExtensionIdentity rejects it).
  const originHost = crypto.randomUUID();
  const ws = new WebSocket(url, ['motrix-bridge.v1'], {
    origin: `moz-extension://${originHost}`,
  });
  const fail = (m) => { console.log('FAIL:', m); try { ws.close(); } catch {} process.exit(3); };
  const timer = setTimeout(() => fail('timeout waiting for pairAccept'), 15000);

  ws.on('open', () => {
    ws.send(JSON.stringify({
      type: 'pairHello',
      protocolVersion: 1,
      browser: 'firefox',
      claimedExtensionId: EXT_ID,
      clientInstallationId: crypto.randomUUID(),
      nmTicket: boot.nmTicket,
      ticketBindingKey: bindingPubB64,
    }));
  });
  ws.on('message', (data) => {
    clearTimeout(timer);
    const msg = JSON.parse(data.toString());
    console.log('SERVER:', JSON.stringify(msg));
    if (msg.type === 'pairAccept') {
      console.log('OK: pairHello admitted, approval dialog queued (identity: attested-non-official)');
      // Close to abort the dialog and free the single dialog slot.
      setTimeout(() => { ws.close(); process.exit(0); }, 500);
    } else if (msg.type === 'pairError') {
      fail('pairError ' + msg.code);
    }
  });
  ws.on('error', (e) => fail('ws error: ' + e.message));
  ws.on('close', (code) => { clearTimeout(timer); console.log('closed', code); process.exit(code === 1000 ? 0 : 4); });
})().catch((e) => { console.log('ERR', e.message); process.exit(5); });
