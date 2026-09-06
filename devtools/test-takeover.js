// Final E2E: enable takeover in the REAL extension, then trigger a real
// Firefox download (Content-Disposition: attachment) and let the extension's
// downloads.onCreated interception hand it to Motrix.
(async () => {
  const send = (kind, payload) => browser.runtime.sendMessage({ kind, payload });
  const out = document.getElementById('out');
  const log = (s) => { out.textContent += s + '\n'; };
  try {
    log('getState ...');
    const s = await send('bg.getState', undefined);
    log('state=' + s.state);
    if (s.state !== 'connected') throw new Error('not connected');
    log('setTakeoverConfig enabled ...');
    const cfg = await send('bg.setTakeoverConfig', {
      enabled: true,
      consentAckVersion: 1,
      defaultAction: 'motrix',
      rules: [],
    });
    log('config ok: ' + JSON.stringify(cfg));
    log('triggering real download: proof.ovh 1Mb.dat');
    document.title = 'TAKEOVER-TEST: triggered';
    // Navigate away: the attachment response fires downloads.onCreated, which
    // the extension's Firefox interception turns into a Motrix submission.
    location.href = 'https://proof.ovh.net/files/1Mb.dat';
  } catch (e) {
    log('ERROR: ' + (e && e.message ? e.message : String(e)));
    document.title = 'TAKEOVER-TEST: error';
  }
})();
