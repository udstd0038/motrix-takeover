import http from 'node:http';

function probe(port, path, method = 'GET', headers = {}) {
  return new Promise((resolve) => {
    const req = http.request(
      { host: '127.0.0.1', port, path, method, headers, timeout: 3000 },
      (res) => {
        let d = '';
        res.on('data', (c) => (d += c));
        res.on('end', () => resolve({ port, path, status: res.statusCode, body: d.slice(0, 500) }));
      }
    );
    req.on('timeout', () => { req.destroy(); resolve({ port, path, error: 'timeout' }); });
    req.on('error', (e) => resolve({ port, path, error: e.code }));
    req.end();
  });
}

(async () => {
  const ports = [16802, 16803, 16804, 16805, 16806];
  for (const p of ports) {
    const r = await probe(p, '/discovery');
    console.log(JSON.stringify(r));
  }
  // try nonce on first responding port
  for (const p of ports) {
    const r = await probe(p, '/nonce', 'POST', { 'X-Motrix-Bridge': '1', 'Content-Length': '0' });
    if (!r.error) {
      console.log('NONCE =>', JSON.stringify(r));
      break;
    }
  }
})();
