// Minimal CDP helper: connect to a page target and evaluate an expression.
// Usage: node scripts/cdp-eval.mjs <wsUrl> <expression>
import WebSocket from 'ws';

const [wsUrl, expression] = process.argv.slice(2);
const ws = new WebSocket(wsUrl);
const pending = new Map();
let id = 0;

function call(method, params = {}) {
  return new Promise((resolve, reject) => {
    const myId = ++id;
    pending.set(myId, { resolve, reject });
    ws.send(JSON.stringify({ id: myId, method, params }));
  });
}

ws.on('message', (d) => {
  const msg = JSON.parse(d.toString());
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) reject(new Error(msg.error.message));
    else resolve(msg.result);
  }
});
ws.on('error', (e) => { console.error('WS_ERR', e.message); process.exit(2); });
ws.on('open', async () => {
  try {
    const r = await call('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (r.exceptionDetails) {
      console.log('EVAL_EXCEPTION:', JSON.stringify(r.exceptionDetails).slice(0, 500));
      process.exit(3);
    }
    console.log(JSON.stringify(r.result.value));
    process.exit(0);
  } catch (e) {
    console.error('EVAL_FAIL', e.message);
    process.exit(4);
  }
});
setTimeout(() => { console.error('TIMEOUT'); process.exit(5); }, 20000);
