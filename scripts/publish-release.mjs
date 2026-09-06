// Publish the GitHub Release for the current version and upload the release
// assets from ./release. Requires GH_TOKEN (repo-scoped) in the environment.
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';

const OWNER = 'udstd0038';
const REPO = 'motrix-takeover';
const TAG = 'v0.2.0';
const TOKEN = process.env.GH_TOKEN;
if (!TOKEN) { console.log('NO_TOKEN'); process.exit(2); }

function request(host, method, p, headers, body) {
  return new Promise((res, rej) => {
    const req = https.request({ host, method, path: p, headers, timeout: 120000 }, (r) => {
      const chunks = [];
      r.on('data', (c) => chunks.push(c));
      r.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        res({ status: r.statusCode, text, location: r.headers.location });
      });
    });
    req.on('error', rej);
    if (body) req.write(body);
    req.end();
  });
}

const apiHeaders = {
  Authorization: 'Bearer ' + TOKEN,
  'User-Agent': 'motrix-takeover-release',
  Accept: 'application/vnd.github+json',
  'Content-Type': 'application/json',
};

const BODY = `## Motrix Takeover 0.2.0 — first community release

Community fork of [motrixapp/motrix-extension](https://github.com/motrixapp/motrix-extension) that hands Firefox downloads to [Motrix](https://motrix.app) (verified against Motrix 2.0.0-beta.32). This build is **signed by Mozilla (AMO, unlisted channel)** and installs directly into release Firefox.

### Install

1. Download \`motrix-takeover-0.2.0-signed.xpi\`.
2. Open it with Firefox (or drag it onto a Firefox window, or use **about:addons → gear → Install Add-on From File**).
3. Click **Add** in the permission prompt.

Then follow the [README](https://github.com/udstd0038/motrix-takeover#installation) for the one-time native-messaging registration and first pairing. Full setup and usage instructions: [English README](https://github.com/udstd0038/motrix-takeover/blob/main/README.md) / [中文说明](https://github.com/udstd0038/motrix-takeover/blob/main/README.zh-CN.md).

### Files

- \`motrix-takeover-0.2.0-signed.xpi\` — signed package, install this one
- \`motrix_takeover-0.2.0.zip\` — unsigned build artifact (for inspection / AMO source review)
- \`SHA256SUMS.txt\` — checksums of the two packages

### Verified end-to-end

Native messaging, MBP1 pairing (SPAKE2 + AES-256-GCM envelope), MDXP handshake, \`download/submit\`, and real download takeover were all exercised on Windows 11 / Firefox 154 / Motrix 2.0.0-beta.32 — see the README's verification section for the evidence.

License: MIT (based on motrixapp/motrix-extension). Not affiliated with the official Motrix project.`;

(async () => {
  // 1. Create the release
  const create = await request('api.github.com', 'POST', `/repos/${OWNER}/${REPO}/releases`, apiHeaders,
    JSON.stringify({ tag_name: TAG, name: 'Motrix Takeover 0.2.0', body: BODY, draft: false, prerelease: false }));
  console.log('create:', create.status);
  if (![201].includes(create.status)) { console.log(create.text.slice(0, 400)); process.exit(3); }
  const rel = JSON.parse(create.text);
  console.log('release:', rel.html_url, 'id', rel.id);

  // 2. Upload assets
  const assets = [
    'release/motrix-takeover-0.2.0-signed.xpi',
    'release/motrix_takeover-0.2.0.zip',
    'release/SHA256SUMS.txt',
  ];
  for (const file of assets) {
    const data = fs.readFileSync(file);
    const name = path.basename(file);
    const up = await request('uploads.github.com', 'POST',
      `/repos/${OWNER}/${REPO}/releases/${rel.id}/assets?name=${encodeURIComponent(name)}`,
      {
        Authorization: 'Bearer ' + TOKEN,
        'User-Agent': 'motrix-takeover-release',
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/octet-stream',
        'Content-Length': data.length,
      },
      data);
    console.log('upload', name, '->', up.status);
    if (up.status !== 201) { console.log(up.text.slice(0, 300)); process.exit(4); }
  }
  console.log('PUBLISHED', rel.html_url);
})().catch((e) => { console.log('ERR', e.message); process.exit(5); });
