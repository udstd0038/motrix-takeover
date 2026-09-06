// Test page for the fork: exercises the REAL Firefox native-messaging path
// from an extension page context. Result is written to the tab title so an
// external orchestrator can read it via the window title.
(async () => {
  const out = { steps: [] };
  try {
    out.steps.push('connectNative');
    const port = browser.runtime.connectNative('app.motrix.bridge.takeover');
    out.steps.push('connected');
    const reply = await new Promise((resolve, reject) => {
      const t = setTimeout(() => {
        port.disconnect();
        reject(new Error('timeout'));
      }, 20000);
      port.onMessage.addListener((m) => {
        clearTimeout(t);
        resolve(m);
      });
      port.onDisconnect.addListener(() => {
        clearTimeout(t);
        reject(
          new Error(
            'disconnect: ' + JSON.stringify(browser.runtime.lastError?.message ?? null)
          )
        );
      });
      try {
        port.postMessage({ action: 'start', allowLaunch: false });
      } catch (e) {
        clearTimeout(t);
        reject(new Error('post: ' + (e.message ?? String(e))));
      }
    });
    out.steps.push('reply');
    out.reply = reply;
    out.ok = true;
  } catch (e) {
    out.ok = false;
    out.error = String(e && e.message ? e.message : e);
  }
  const text = JSON.stringify(out);
  document.getElementById('out').textContent = text;
  document.title = 'NM-TEST: ' + text;
})();
