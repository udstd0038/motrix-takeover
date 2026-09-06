// Legacy devtools RDP client: attach to the extension's background worker via
// the Addon actor and evaluate the native-messaging bootstrap there.
import http from 'node:http';
import WebSocket from 'ws';

const NM_EXPR = `
(async () => {
  const steps = [];
  steps.push('connectNative');
  const port = await browser.runtime.connectNative('app.motrix.bridge.takeover');
  steps.push('connected');
  const reply = await new Promise((resolve, reject) => {
    const t = setTimeout(() => { port.disconnect(); reject(new Error('timeout')); }, 20000);
    port.onMessage.addListener((m) => { clearTimeout(t); resolve(m); });
    port.onDisconnect.addListener(() => {
      clearTimeout(t);
      reject(new Error('disconnected: ' + JSON.stringify(browser.runtime.lastError?.message ?? null)));
    });
    try { port.postMessage({ action: 'start', allowLaunch: false }); }
    catch (e) { clearTimeout(t); reject(new Error('post: ' + e.message)); }
  });
  steps.push('reply');
  return JSON.stringify({ steps, reply });
})()
`;

function getJson(url) {
  return new Promise((res, rej) => {
    http.get(url, { timeout: 8000 }, (r) => {
      let d = '';
      r.on('data', (c) => (d += c));
      r.on('end', () => {
        try { res(JSON.parse(d)); } catch (e) { rej(new Error('bad json: ' + d.slice(0, 200))); }
      });
    }).on('error', rej);
  });
}

class Rdp {
  constructor(ws) {
    this.ws = ws;
    this.requests = new Map();
    this.id = 0;
    ws.on('message', (d) => {
      const msg = JSON.parse(d.toString());
      if (msg.id && this.requests.has(msg.id)) {
        const { res, rej } = this.requests.get(msg.id);
        this.requests.delete(msg.id);
        if (msg.error) rej(new Error(msg.error + ': ' + (msg.message ?? '')));
        else res(msg.result);
      }
    });
  }
  request(to, type, params = {}) {
    return new Promise((res, rej) => {
      const id = ++this.id;
      this.requests.set(id, { res, rej });
      this.ws.send(JSON.stringify({ to, type, id, ...params }));
    });
  }
}

(async () => {
  const version = await getJson('http://127.0.0.1:9225/json/version');
  console.log('root ws:', version.webSocketDebuggerUrl);
  const ws = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.on('open', res); ws.on('error', rej); });
  const rdp = new Rdp(ws);
  const root = version.webSocketDebuggerUrl.split('/').pop();

  // listAddons on the root actor
  const addons = await rdp.request(root, 'listAddons');
  const mine = addons.addons.find((a) => (a.id ?? '').includes('motrix'));
  console.log('addons:', addons.addons.map((a) => a.id).join(', '));
  if (!mine) throw new Error('our addon not found in listAddons');

  // listWorkers on the addon actor
  const workers = await rdp.request(mine.actor, 'listWorkers');
  console.log('workers:', workers.workers.map((w) => w.url).join(' | '));
  const sw = workers.workers.find((w) => /service-worker|background/.test(w.url ?? '')) ?? workers.workers[0];
  if (!sw) throw new Error('no worker found');

  // attach to the worker's console actor
  const attached = await rdp.request(sw.actor, 'attach', {});
  const thread = attached.threadActor;
  // evaluate via the console actor of the worker (attach returns consoleActor on worker attach)
  const consoleActor = attached.consoleActor;
  if (!consoleActor) throw new Error('no console actor on worker attach');

  const evalRes = await rdp.request(consoleActor, 'evaluateJSAsync', {
    text: NM_EXPR,
    eager: false,
    wantResult: true,
  });
  console.log('NM_RESULT:', JSON.stringify(evalRes.result ?? evalRes));
  ws.close();
  process.exit(0);
})().catch((e) => { console.log('RDP_FAIL:', e.message); process.exit(3); });
setTimeout(() => { console.log('TIMEOUT'); process.exit(4); }, 60000);
