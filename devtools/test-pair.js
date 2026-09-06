// Full in-page orchestrator: drives the REAL extension background (MessageBus)
// through the official pairing flow, reads the pairing code out of Motrix's
// approval dialog via CDP, submits it, and reports the final connection state.
(async () => {
  const logLine = (line) => {
    document.getElementById('out').textContent += line + '\n';
  };
  const setTitle = (t) => { document.title = t; };
  const send = (kind, payload) => browser.runtime.sendMessage({ kind, payload });

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  async function cdpReadCode() {
    // list targets
    const listRes = await fetch('http://127.0.0.1:9223/json');
    const targets = await listRes.json();
    const main = targets.find((t) => t.url.includes('w=main'));
    if (!main) throw new Error('no w=main target');
    const code = await new Promise((resolve, reject) => {
      const ws = new WebSocket(main.webSocketDebuggerUrl);
      const timer = setTimeout(() => { try { ws.close(); } catch {} reject(new Error('cdp timeout')); }, 15000);
      ws.onopen = () => ws.send(JSON.stringify({
        id: 1,
        method: 'Runtime.evaluate',
        params: {
          expression: `(() => { const t = document.body.innerText; const m = t.match(/[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}/); return m ? m[0] : ''; })()`,
          returnByValue: true,
        },
      }));
      ws.onmessage = (ev) => {
        const msg = JSON.parse(ev.data);
        if (msg.id === 1) {
          clearTimeout(timer);
          ws.close();
          const v = msg.result?.result?.value;
          if (v) resolve(v); else reject(new Error('no code in dialog'));
        }
      };
      ws.onerror = () => { clearTimeout(timer); reject(new Error('cdp ws error')); };
    });
    return code;
  }

  try {
    // 1. Discover candidates (NM bootstrap inside the real SW)
    logLine('listPairCandidates ...');
    const { candidates } = await send('bg.listPairCandidates', undefined);
    logLine('candidates: ' + JSON.stringify(candidates));
    if (!candidates || candidates.length === 0) throw new Error('no candidates');
    const port = candidates[0].port;

    // 2. Start the first-pair attempt
    logLine('chooseCandidate port=' + port);
    await send('bg.chooseCandidate', { port });

    // 3. Wait for the code prompt (heartbeat to keep the SW alive)
    let state;
    let pairingCode = null;
    for (let i = 0; i < 60; i++) {
      const s = await send('bg.getState', undefined);
      state = s.state;
      if (s.pairingCode) { pairingCode = s.pairingCode; break; }
      if (state === 'connected') break;
      if (s.lastError || s.backoff) { logLine('early state: ' + JSON.stringify(s)); break; }
      if (i % 10 === 4) await send('bg.pairHeartbeat', undefined);
      await sleep(500);
    }
    logLine('state=' + state + (pairingCode ? ' pairingCode=' + JSON.stringify(pairingCode) : ''));
    if (state === 'connected') { setTitle('PAIR-TEST: already connected'); return; }
    if (!pairingCode) throw new Error('no pairingCode prompt (state=' + state + ')');

    // 4. Read the code from Motrix's dialog via CDP
    const code = await cdpReadCode();
    logLine('code read via CDP');

    // 5. Submit the code (never log it)
    const sub = await send('bg.submitPairingCode', { code });
    logLine('submitPairingCode -> ' + JSON.stringify(sub));
    if (!sub.ok) throw new Error('submit failed: ' + (sub.error ?? ''));

    // 6. Wait for connected
    for (let i = 0; i < 60; i++) {
      const s = await send('bg.getState', undefined);
      state = s.state;
      if (state === 'connected') break;
      if (s.lastError || s.backoff) { logLine('post-submit state: ' + JSON.stringify(s)); break; }
      if (i % 10 === 4) await send('bg.pairHeartbeat', undefined);
      await sleep(500);
    }
    logLine('final state=' + state);
    setTitle('PAIR-TEST: ' + state);
  } catch (e) {
    const msg = e && e.message ? e.message : String(e);
    logLine('ERROR: ' + msg);
    const log = document.getElementById('out').textContent;
    setTitle('PAIR-TEST: error :: ' + log.split('\n').filter(Boolean).pop());
  }
})();
