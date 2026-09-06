# Motrix Takeover

> Community fork of the official [motrixapp/motrix-extension](https://github.com/motrixapp/motrix-extension) — a Firefox extension that hands your browser downloads over to [Motrix](https://motrix.app), the open-source download manager.
>
> 简体中文说明见 [README.zh-CN.md](./README.zh-CN.md)

**Motrix Takeover** turns "download this" into a single click: instead of the browser's own download manager, the file goes to **Motrix** — with your login session carried along, so even files behind a sign-in download fine. It also handles things browsers can't, like assembling HLS/DASH streaming video into a single file with FFmpeg.

Everything about the *pairing protocol* and *security* is unchanged from the official codebase (which passed six independent adversarial crypto reviews). This fork only changes the extension identity so it can be built, loaded, and paired independently of the store release.

---

## Why this fork exists

The official extension is being rolled out alongside Motrix 2 — the store links were not published yet at the time of this fork. This repository lets you build the full-featured extension yourself, with your own identity:

| | Official | This fork |
|---|---|---|
| Gecko ID (Firefox) | `motrix-extension@motrix.app` | `motrix-takeover@local.dev` |
| Native-messaging host name | `app.motrix.bridge` | `app.motrix.bridge.takeover` |
| Display name | Motrix Extension | Motrix Takeover |
| Motrix identity verdict | `official` | `attested-non-official` (pairs normally, shown without branding) |
| Protocol / crypto code | — | **Unchanged** |

Both extensions talk to the **same** Motrix bridge and the same shipped `motrix-native-host` binary; the distinct host name simply keeps the official registration untouched.

---

## Features

- **One-click download takeover** — eligible Firefox downloads go straight to Motrix, with a minimum-size threshold and a per-host denylist.
- **Authenticated downloads** — headers and cookies are replayed so files behind a login work without manual cookie copying.
- **Streaming video (HLS/DASH)** — Motrix downloads the segments and merges audio/video with FFmpeg.
- **Magnet links** — handed straight to the torrent workflow.
- **Right-click** — "Download with Motrix" on any link.
- **Manual tasks** — paste an HTTP(S) or `magnet:` link into the popup.
- **Page resource sniffer** — list video / audio / images already loaded by the current page and submit a selection in one batch.
- **Remote Motrix Server** — pair with a `ws://` / `wss://` Motrix Server (cookies and headers stay off until you explicitly grant them per Server).
- **Handoff failure recovery** — if Motrix can't accept a download, it is restored to the browser; failures are explained in plain words ("session expired", "DRM-protected", …).

---

## How it works

The extension implements two stacked official protocols, both defined by the Motrix project:

1. **Native Messaging bootstrap** — `browser.runtime.connectNative()` launches Motrix's shipped `motrix-native-host` binary, which reads the local bridge endpoint, mints a one-time pairing nonce plus an attestation ticket proving *which* extension is calling, and returns `{ port, nonce, ticket }`.
2. **MBP1 pairing** (`motrix-bridge.v1` WebSocket on `127.0.0.1:16802–16806`) — a SPAKE2 password-authenticated key exchange whose password is the **8-character code shown in Motrix's approval dialog**. After mutual key confirmation, every frame is wrapped in AES-256-GCM. Reconnects use a long-lived credential, no code needed again.
3. **MDXP** (JSON-RPC 2.0) — the application protocol on top: `motrix/initialize`, `download/submit`, `task/*`, progress notifications, and the server-initiated `url/probe` / `url/resolve` page adapters.

The security properties (fake-server resistance, replay protection, strict sequence numbers, guess-rate backoff on **both** sides) are specified in `docs/bridge-pairing-protocol.md` of the [Motrix repository](https://github.com/agalwood/Motrix) and are **not modified by this fork**.

---

## Releases

Pre-built, **Mozilla-signed** packages are published on the [Releases](https://github.com/udstd0038/motrix-takeover/releases) page. To install directly into release Firefox:

1. Download `motrix-takeover-<version>-signed.xpi` from the latest release.
2. Open it with Firefox (or drag it onto a Firefox window, or use **about:addons → gear → Install Add-on From File**).
3. Click **Add** in the permission prompt.

After installation, complete the [native-messaging registration](#installation) and [first pairing](#first-pairing). A `SHA256SUMS.txt` file is published alongside every release.

## Requirements

- **Firefox** 142 or later (desktop).
- **Motrix** 2.0.0-beta.x (verified against **2.0.0-beta.32**) or a compatible Motrix Server.
- **Windows** for the provided one-shot NM registration script; macOS / Linux are supported by the same mechanism (manifest files under the browser's `NativeMessagingHosts` directory) — see the upstream docs.
- Node.js ≥ 22.13 and pnpm 11 to build from source.

---

## Installation

### 1. Build the Firefox package

```bash
git clone https://github.com/udstd0038/motrix-takeover.git motrix-takeover
cd motrix-takeover
pnpm install --frozen-lockfile
pnpm run build:firefox
```

The unpacked extension is written to `dist/firefox/`.

### 2. Register the native-messaging host (Windows)

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\register-nm-host.ps1
```

This writes a Firefox manifest that points at Motrix's own
`motrix-native-host.exe` (default install `D:\Program Files\Motrix`; pass
`-MotrixDir <path>` if yours differs) and registers
`HKCU\SOFTWARE\Mozilla\NativeMessagingHosts\app.motrix.bridge.takeover`.

Remove it later with `.\scripts\register-nm-host.ps1 -Unregister`.

### 3. Load the extension in Firefox

Open `about:debugging#/runtime/this-firefox` → **Load Temporary Add-on** →
select `dist/firefox/manifest.json`.

> Temporary add-ons are removed when Firefox restarts. For permanent use,
> sign the package through AMO (`web-ext sign`) or distribute it yourself.

### 4. (Optional) Trust the extension in Motrix

Motrix → **Settings → Integration → Browser extensions** → **Trusted
extensions** → **Add extension** → ID `motrix-takeover@local.dev`, browser
Firefox.

Verified against Motrix 2.0.0-beta.32: **this step is not required for
pairing**. Without it the extension still pairs and shows as
`attested-non-official` in Motrix. Adding it only changes how Motrix displays
the identity.

---

## Usage

### First pairing

1. Start Motrix (make sure **Settings → Integration → Browser extensions →
   "Send downloads from browser extensions"** is on — it is by default).
2. Click the **Motrix Takeover** toolbar icon → **Connect**.
3. Motrix shows an approval dialog with an **8-character code** (`XXXX-XXXX`).
4. Type that code into the extension popup.

The code is the pairing password: key confirmation inside the SPAKE2 exchange
is what actually proves the pairing — there is no second approval click. After
pairing, reconnects happen automatically without a code.

### Take over browser downloads

Open the extension settings → **Download** tab → enable **Takeover**. You can
set a minimum file size and a denylist of hosts that the browser should always
handle itself. Takeover asks for confirmation the first time, because keeping
authenticated downloads working may involve sending cookies for the target
domain to Motrix. A built-in sensitive-host list excludes some banking,
government, and medical sites.

### Other ways to download

- **Right-click a link** → *Download with Motrix* (no takeover needed).
- **Tasks tab** → paste an HTTP(S) or `magnet:` link.
- **Sniffer tab** → pick video / audio / images the current page already loaded.

---

## Verified end-to-end (Motrix 2.0.0-beta.32, Windows 11, Firefox 154)

Every link of the chain was proven on a real machine:

- **Native messaging** — Firefox registry discovery → `motrix-native-host.exe` → `{port, nonce}` reply, verified both by direct invocation (`scripts/test-nm-bootstrap.mjs`) and from a real extension page context (`devtools/test-nm.*`).
- **MBP1 pairing** — full SPAKE2 first pair, verified twice: once by a reference Node client (`scripts/test-mbp1-full-pair.mjs`, validated byte-for-byte against the official normative vectors *before* going online) and once by the **real extension background worker** driven through its own message bus (`devtools/test-pair.*`, final state `connected`).
- **MDXP + download** — `motrix/initialize` against server `motrix 2.0.0-beta.32`, then `download/submit`; a real file was fetched by Motrix/aria2.
- **Takeover** — a real Firefox download was intercepted on `downloads.onCreated`, cancelled in Firefox, and completed by Motrix (the tell-tale: Motrix sanitized Firefox's full-path `DownloadItem.filename` into the final file name).
- **Durable pairing records** — Motrix side `bridge/extension-pairings.json` shows `browser: firefox`, `identityTrust: attested-non-official`, `status: ready`; the extension side stores the credential in `storage.local`.

The `scripts/` and `devtools/` folders contain the full automation harness used
for this verification (CDP dialog reading, UIA fallback, the vector-validated
MBP1 client, and in-extension test pages).

---

## Troubleshooting

**The extension can't find Motrix on this computer.**
Make sure Motrix is running, then rescan. Check that the NM manifest is
registered (`.\scripts\register-nm-host.ps1` shows the manifest) and that
Firefox can reach local addresses. An older Motrix build may also be
incompatible with the current pairing protocol (MBP1 v1 / MDXP 1.0).

**Pairing fails with "rate limited" / "try again later".**
The bridge enforces an anti-guessing backoff after failed attempts (30 s and
up, doubling, capped at 1 h, reset by a successful pairing). Wait it out —
repeated retries only make it longer.

**"Session expired — refresh the page in your browser and try again."**
Your login on the site ran out mid-handoff; refresh and retry.

**A video on the page is missing from the Sniffer list.**
Start playback for a few seconds and scan again. `blob:` URLs, DRM streams and
short-lived links may be unusable.

**I get a file name like `D__Users_Downloads_….dat`.**
Known upstream cosmetic quirk: Firefox reports the download's *full path* as
`DownloadItem.filename`, and Motrix sanitizes it into the final name. The file
itself is complete and correct.

---

## Development

```bash
pnpm dev              # Chromium development build
pnpm dev:firefox      # Firefox development build
pnpm test             # 2000+ unit tests, incl. all MBP1 normative vectors
pnpm lint             # biome + import checks
pnpm run build:firefox
```

Main areas: `src/background/` (pairing, connections, download handoff, task
controls), `src/popup/`, `src/options/`, `src/content/` (page-resource
detection), `src/adapters/` (site adapters), `src/background/mbp1/` (the MBP1
protocol implementation — do not modify without re-running the vector suite).

The crypto dependencies are pinned by the protocol specification
(`@noble/curves@2.4.0`, `@noble/hashes@2.4.0`) — upgrading them requires
re-running every normative vector.

---

## License

[MIT](./LICENSE), © the Motrix project contributors. This fork is based on
[motrixapp/motrix-extension](https://github.com/motrixapp/motrix-extension)
(MIT). Protocol specifications belong to the
[Motrix](https://github.com/agalwood/Motrix) project.
