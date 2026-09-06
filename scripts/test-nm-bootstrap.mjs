// Smoke test: simulate Firefox launching the native-messaging host with our
// fork's caller identity, and verify the full bootstrap round-trip
// (endpoint.json -> /discovery probe -> /nonce -> nmTicket minting).
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';

const HOST = 'D:\\Program Files\\Motrix\\resources\\bin\\motrix-native-host.exe';
const MANIFEST = process.env.APPDATA + '\\Motrix\\bridge\\manifests\\firefox-takeover.json';
const EXT_ID = 'motrix-takeover@local.dev';

// Ed25519 keypair -> 32-byte raw public key (SPKI DER tail).
const { publicKey } = crypto.generateKeyPairSync('ed25519');
const spki = publicKey.export({ format: 'der', type: 'spki' });
const bindingPub = spki.subarray(spki.length - 32);
const bindingPubB64 = bindingPub.toString('base64url');

const request = {
  action: 'bootstrap',
  protocolVersion: 1,
  bindingPub: bindingPubB64,
  allowLaunch: false,
};
const body = Buffer.from(JSON.stringify(request), 'utf8');
const frame = Buffer.alloc(4 + body.length);
frame.writeUInt32LE(body.length, 0);
body.copy(frame, 4);

console.log('spawning host with args:', [MANIFEST, EXT_ID]);
const child = spawn(HOST, [MANIFEST, EXT_ID], { stdio: ['pipe', 'pipe', 'inherit'] });
const chunks = [];
child.stdout.on('data', (c) => chunks.push(c));
child.on('error', (e) => { console.log('SPAWN_ERR', e.message); process.exit(2); });
child.on('close', (code) => {
  console.log('host exited', code);
  const out = Buffer.concat(chunks);
  if (out.length >= 4) {
    const len = out.readUInt32LE(0);
    const reply = JSON.parse(out.subarray(4, 4 + len).toString('utf8'));
    console.log('REPLY:', JSON.stringify(reply, null, 2));
  } else {
    console.log('RAW:', out.toString('utf8'));
  }
});
child.stdin.write(frame);
child.stdin.end();
const safety = setTimeout(() => { console.log('TIMEOUT'); child.kill(); process.exit(3); }, 25000);
safety.unref();
