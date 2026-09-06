// WebDriver BiDi helper: open the extension's options page in a tab and run an
// expression in the REAL extension page context. Verifies that Firefox finds
// our registered native-messaging host (app.motrix.bridge.takeover) and the
// extension environment can complete the bootstrap round-trip.
import WebSocket from 'ws';

const EXT_UUID = 'd526fb66-b634-4675-b593-a2c5cbd788f2';
const OPTIONS_URL = `moz-extension://${EXT_UUID}/options.html`;
const NM_EXPR = `
(async () => {
  const result = { steps: [] };
  result.steps.push('connectNative');
  const port = await browser.runtime.connectNative('app.motrix.bridge.takeover');
  result.steps.push('connected');
  const reply = await new Promise((resolve, reject) => {
    const t = setTimeout(() => { port.disconnect(); reject(new Error('timeout')); }, 20000);
    port.onMessage.addListener((m) => { clearTimeout(t); resolve(m); });
    port.onDisconnect.addListener(() => {
      clearTimeout(t);
      reject(new Error('disconnected: ' + JSON.stringify(browser.runtime.lastError?.message ?? null)));
    });
    try { port.postMessage({ action: 'start', allowLaunch: false }); }
    catch (e) { clearTimeout(t); reject(new Error('post failed: ' + e.message)); }
  });
  result.steps.push('reply');
  result.reply = reply;
  return JSON.stringify(result);
})()
`;

const ws = new WebSocket('ws://127.0.0.1:9224/session');
let id = 0;
const pending = new Map();
function call(method, params = {}) {
  return new Promise((res, rej) => {
    const myId = ++id;
    pending.set(myId, { res, rej, method });
    ws.send(JSON.stringify({ id: myId, method, params }));
  });
}
ws.on('message', (d) => {
  const msg = JSON.parse(d.toString());
  if (msg.id && pending.has(msg.id)) {
    const { res, rej, method } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) rej(new Error(`${method}: ${msg.error.error ?? 'bidi error'} ${msg.error.message ?? ''}`.trim() + ' ' + JSON.stringify(msg.error).slice(0, 160)));
    else res(msg.result);
  }
});

ws.on('error', (e) => { console.log('WS_ERR', e.message); process.exit(2); });
ws.on('open', async () => {
  try {
    let sessionOk = false;
    for (let attempt = 1; attempt <= 3 && !sessionOk; attempt++) {
      try {
        await call('session.new', { capabilities: {} });
        sessionOk = true;
      } catch (e) {
        console.log(`session.new attempt ${attempt} failed: ${e.message}`);
        if (attempt < 3) await new Promise((r) => setTimeout(r, 2000));
        else throw e;
      }
    }
    console.log('session.new OK');
    const created = await call('browsingContext.create', { type: 'tab' });
    const context = created.context;
    console.log('context:', context);
    await call('browsingContext.navigate', { context, url: OPTIONS_URL });
    console.log('navigated to', OPTIONS_URL);
    await new Promise((r) => setTimeout(r, 1500));
    const ev = await call('script.evaluate', {
      expression: NM_EXPR,
      awaitPromise: true,
      target: { context },
    });
    console.log('NM_RESULT:', JSON.stringify(ev.result));
    try { await call('session.end', {}); } catch {}
    ws.close();
    setTimeout(() => process.exit(0), 300);
  } catch (e) {
    console.log('BIDI_FAIL:', e.message);
    try { await call('session.end', {}); } catch {}
    ws.close();
    setTimeout(() => process.exit(3), 300);
  }
});
setTimeout(() => { console.log('TIMEOUT'); process.exit(4); }, 60000);
