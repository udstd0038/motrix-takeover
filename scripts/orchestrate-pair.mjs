// One-shot orchestrator: runs the live MBP1 pairing client, waits for it to
// reach AWAITING-CODE, reads the code out of Motrix's approval dialog via CDP,
// feeds it to the client through the code file, and relays the client output.
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import WebSocket from 'ws';

const CODE_FILE = 'D:\\DeepSeekHarness\\workspace\\code\\motrix-ff-extension\\scripts\\.pair-code.txt';
fs.rmSync(CODE_FILE, { force: true });

function cdpJson() {
  return new Promise((res, rej) => {
    http.get('http://127.0.0.1:9223/json', { timeout: 5000 }, (r) => {
      let d = '';
      r.on('data', (c) => (d += c));
      r.on('end', () => res(JSON.parse(d)));
    }).on('error', rej);
  });
}

function cdpReadCode(wsUrl) {
  return new Promise((res, rej) => {
    const ws = new WebSocket(wsUrl);
    ws.on('open', () => ws.send(JSON.stringify({
      id: 1,
      method: 'Runtime.evaluate',
      params: {
        expression: `(() => { const t = document.body.innerText; const m = t.match(/[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}/); return m ? m[0] : ''; })()`,
        returnByValue: true,
      },
    })));
    ws.on('message', (d) => {
      const msg = JSON.parse(d.toString());
      if (msg.id === 1) {
        ws.close();
        if (msg.result?.result?.value) res(msg.result.result.value);
        else rej(new Error('no code in dialog: ' + JSON.stringify(msg).slice(0, 300)));
      }
    });
    ws.on('error', rej);
    setTimeout(() => rej(new Error('cdp timeout')), 15000);
  });
}

(async () => {
  const client = spawn(process.execPath, ['scripts/test-mbp1-full-pair.mjs'], {
    cwd: 'D:\\DeepSeekHarness\\workspace\\code\\motrix-ff-extension',
    stdio: ['ignore', 'pipe', 'inherit'],
    env: { ...process.env, CODE_FILE },
  });
  let output = '';
  let fed = false;
  const safety = setTimeout(() => { console.log('ORCHESTRATOR TIMEOUT'); client.kill(); process.exit(9); }, 150000);

  client.stdout.on('data', (chunk) => {
    output += chunk.toString();
    process.stdout.write(chunk);
    if (!fed && output.includes('AWAITING-CODE')) {
      fed = true;
      (async () => {
        try {
          const targets = await cdpJson();
          const main = targets.find((t) => t.url.includes('w=main'));
          if (!main) throw new Error('main window target missing');
          const code = await cdpReadCode(main.webSocketDebuggerUrl);
          console.log('ORCHESTRATOR: code read via CDP, feeding client ...');
          fs.writeFileSync(CODE_FILE, code);
        } catch (e) {
          console.log('ORCHESTRATOR CDP FAIL:', e.message);
          client.kill();
          process.exit(8);
        }
      })();
    }
  });
  client.on('close', (code) => { clearTimeout(safety); console.log('CLIENT EXIT', code); process.exit(code ?? 0); });
})().catch((e) => { console.log('FAIL', e.message); process.exit(7); });
