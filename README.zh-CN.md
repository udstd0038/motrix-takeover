# Motrix Takeover（社区 fork 版）

> 基于官方 [motrixapp/motrix-extension](https://github.com/motrixapp/motrix-extension) 的社区 fork —— 一个让 Firefox 浏览器下载任务交给开源下载管理器 [Motrix](https://motrix.app) 的浏览器扩展。
>
> English version: [README.md](./README.md)

**Motrix Takeover** 把"下载这个"变成一次点击：文件不再走浏览器自带的下载管理器，而是交给 **Motrix** —— 你的登录会话也会一并带过去，所以需要登录才能下的文件照样能下。它还能干浏览器干不了的事，比如用 FFmpeg 把 HLS/DASH 流媒体视频合成一个完整文件。

**配对协议与安全实现**与官方代码库完全一致（官方实现经过了六轮独立对抗性密码学审查）。本 fork 只改了扩展身份，让你可以在官方商店版本上线之前，独立构建、加载并配对使用。

---

## 为什么有这个 fork

官方扩展正随 Motrix 2 逐步上线，fork 时商店链接尚未发布。本仓库让你可以用自己的身份构建这个全功能扩展：

| | 官方版 | 本 fork |
|---|---|---|
| Firefox Gecko ID | `motrix-extension@motrix.app` | `motrix-takeover@local.dev` |
| 原生消息（NM）宿主名 | `app.motrix.bridge` | `app.motrix.bridge.takeover` |
| 显示名称 | Motrix Extension | Motrix Takeover |
| Motrix 侧身份判定 | `official` | `attested-non-official`（可正常配对，仅无官方品牌标识） |
| 协议 / 密码学代码 | — | **未改动** |

两者连接的是**同一个** Motrix 桥接服务、复用 Motrix 自带的同一个 `motrix-native-host` 二进制；独立的宿主名只是为了避免覆盖官方版的注册。

---

## 功能

- **一键接管下载** —— 符合条件的 Firefox 下载直接交给 Motrix，可设最小文件大小阈值与按域名的排除列表。
- **带登录态的下载** —— 重放请求头与 Cookie，登录后才能下载的文件无需手动复制 Cookie。
- **流媒体视频（HLS/DASH）** —— Motrix 下载分片后用 FFmpeg 合成音视频。
- **磁力链接** —— 直接进入种子流程。
- **右键菜单** —— 对任意链接"用 Motrix 下载"。
- **手动任务** —— 在弹窗里粘贴 HTTP(S) 或 `magnet:` 链接。
- **页面资源嗅探** —— 列出当前页面已加载的视频 / 音频 / 图片，可批量提交。
- **远程 Motrix Server** —— 通过 `ws://` / `wss://` 配对（Cookie 与请求头默认关闭，需对每个 Server 显式授权）。
- **移交失败兜底** —— Motrix 无法接收时自动退回浏览器下载，并用大白话说明原因（"会话已过期"、"受 DRM 保护"等）。

---

## 工作原理

扩展实现了两层官方协议，均由 Motrix 项目定义：

1. **Native Messaging 引导** —— `browser.runtime.connectNative()` 启动 Motrix 自带的 `motrix-native-host` 二进制，宿主读取本地桥接端点，签发一次性配对 nonce 和一张证明"是哪个扩展在调用"的 attestation ticket，返回 `{ port, nonce, ticket }`。
2. **MBP1 配对**（`motrix-bridge.v1` WebSocket，`127.0.0.1:16802–16806`）—— 基于 SPAKE2 的口令认证密钥交换，口令就是 **Motrix 审批对话框中显示的 8 位配对码**。双向密钥确认后，所有帧由 AES-256-GCM 包裹。之后的重连使用长期凭据，无需再输码。
3. **MDXP**（JSON-RPC 2.0）—— 上层应用协议：`motrix/initialize`、`download/submit`、`task/*`、进度通知，以及服务端发起的 `url/probe` / `url/resolve` 页面适配器。

安全特性（抗假服务器、防重放、严格序号、**双侧**防猜退避等）定义在 [Motrix 仓库](https://github.com/agalwood/Motrix) 的 `docs/bridge-pairing-protocol.md` 中，本 fork **未做任何修改**。

---

## 环境要求

- **Firefox** 142+（桌面版）。
- **Motrix** 2.0.0-beta.x（已在 **2.0.0-beta.32** 上验证）或兼容的 Motrix Server。
- **Windows** 有提供的一键 NM 注册脚本；macOS / Linux 使用相同机制（浏览器 `NativeMessagingHosts` 目录下的 manifest），参见上游文档。
- 源码构建需要 Node.js ≥ 22.13 与 pnpm 11。

---

## 安装

### 1. 构建 Firefox 包

```bash
git clone <本仓库地址> motrix-takeover
cd motrix-takeover
pnpm install --frozen-lockfile
pnpm run build:firefox
```

解包后的扩展在 `dist/firefox/`。

### 2. 注册原生消息宿主（Windows）

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\register-nm-host.ps1
```

该脚本会生成指向 Motrix 自带 `motrix-native-host.exe` 的 Firefox manifest（默认安装路径 `D:\Program Files\Motrix`，可用 `-MotrixDir <路径>` 指定），并注册注册表项 `HKCU\SOFTWARE\Mozilla\NativeMessagingHosts\app.motrix.bridge.takeover`。

卸载：`.\scripts\register-nm-host.ps1 -Unregister`。

### 3. 在 Firefox 中加载扩展

打开 `about:debugging#/runtime/this-firefox` → **临时载入附加组件** →
选择 `dist/firefox/manifest.json`。

> 临时附加组件在 Firefox 重启后会失效。如需长期使用，请通过 AMO 签名
> （`web-ext sign`）或自行分发。

### 4.（可选）在 Motrix 中信任本扩展

Motrix → **设置 → 集成 → 浏览器扩展** → **受信任的扩展** →
**添加扩展** → ID 填 `motrix-takeover@local.dev`，浏览器选 Firefox。

已在 Motrix 2.0.0-beta.32 上验证：**此步骤并非配对必需**。不加也能正常配对，
Motrix 中身份显示为 `attested-non-official`；添加只是改变身份展示方式。

---

## 使用

### 首次配对

1. 启动 Motrix（确认 **设置 → 集成 → 浏览器扩展 →「用浏览器扩展发送下载到 Motrix」** 处于开启状态——默认就是开的）。
2. 点击工具栏的 **Motrix Takeover** 图标 → **Connect**。
3. Motrix 弹出审批对话框，显示 **8 位配对码**（`XXXX-XXXX`）。
4. 把配对码输入扩展弹窗。

配对码即口令：SPAKE2 交换中的密钥确认本身就是批准证明——没有第二次"批准"点击。配对成功后，后续重连自动完成，无需再输码。

### 接管浏览器下载

打开扩展设置 → **Download** 页 → 开启 **Takeover**。可设置最小文件大小阈值，以及永远交给浏览器自己处理的域名排除列表。首次开启会请求确认：为了让带登录态的下载正常工作，扩展可能需要把目标域名的 Cookie 随任务发给 Motrix。内置的敏感站点列表排除了部分银行、政务和医疗网站。

### 其他下载方式

- **右键链接** → *用 Motrix 下载*（无需开启接管）。
- **Tasks 页** → 粘贴 HTTP(S) 或 `magnet:` 链接。
- **Sniffer 页** → 挑选当前页面已加载的视频 / 音频 / 图片。

---

## 真机验证记录（Motrix 2.0.0-beta.32，Windows 11，Firefox 154）

全链路每个环节都在真机上验证过：

- **原生消息** —— Firefox 注册表发现 → `motrix-native-host.exe` → `{port, nonce}` 应答，分别通过直接调用（`scripts/test-nm-bootstrap.mjs`）与真实扩展页面上下文（`devtools/test-nm.*`）双重验证。
- **MBP1 配对** —— 完整 SPAKE2 首次配对验证两次：一次用参考 Node 客户端（`scripts/test-mbp1-full-pair.mjs`，上线前先与官方规范性测试向量逐字节比对通过），一次用**真实扩展后台 worker** 经自身消息总线驱动（`devtools/test-pair.*`，最终状态 `connected`）。
- **MDXP + 下载** —— 对服务器 `motrix 2.0.0-beta.32` 完成 `motrix/initialize` 后 `download/submit`，Motrix/aria2 真实下载了文件。
- **接管** —— Firefox 中一次真实下载在 `downloads.onCreated` 被拦截、在浏览器中取消、由 Motrix 完成（铁证：Motrix 把 Firefox 全路径形式的 `DownloadItem.filename` 清洗成了最终文件名）。
- **持久化配对记录** —— Motrix 侧 `bridge/extension-pairings.json` 显示 `browser: firefox`、`identityTrust: attested-non-official`、`status: ready`；扩展侧凭据保存在 `storage.local`。

`scripts/` 与 `devtools/` 目录保留了上述验证用的完整自动化工具（CDP 对话框读取、UIA 备选、经向量校验的 MBP1 客户端、扩展内测试页）。

---

## 常见问题

**扩展找不到本机的 Motrix。**
确认 Motrix 正在运行后重新扫描；检查 NM manifest 是否已注册（运行注册脚本可看到 manifest 内容），并确认 Firefox 允许访问本地地址。过旧的 Motrix 版本也可能与当前配对协议（MBP1 v1 / MDXP 1.0）不兼容。

**配对报"rate limited / 稍后重试"。**
桥接服务对失败尝试实施防猜退避（30 秒起翻倍，上限 1 小时，配对成功即重置）。等它过去——反复重试只会把退避时间越拉越长。

**提示"会话已过期 — 请在浏览器中刷新页面后重试"。**
网站在移交过程中登录态失效了；刷新页面后重试即可。

**Sniffer 列表里找不到页面上的视频。**
播放几秒后再扫描。`blob:` URL、DRM 流与短时效链接可能无法使用。

**下载的文件名形如 `D__Users_Downloads_….dat`。**
已知的上游外观瑕疵：Firefox 把下载的*完整路径*作为 `DownloadItem.filename` 上报，Motrix 清洗后写进了最终文件名。文件本身是完整正确的。

---

## 开发

```bash
pnpm dev              # Chromium 开发构建
pnpm dev:firefox      # Firefox 开发构建
pnpm test             # 2000+ 单元测试，含全部 MBP1 规范性向量
pnpm lint             # biome + import 检查
pnpm run build:firefox
```

主要目录：`src/background/`（配对、连接、下载移交、任务控制）、`src/popup/`、`src/options/`、`src/content/`（页面资源探测）、`src/adapters/`（站点适配器）、`src/background/mbp1/`（MBP1 协议实现——未经重跑向量套件请勿改动）。

密码学依赖版本由协议规范锁定（`@noble/curves@2.4.0`、`@noble/hashes@2.4.0`），任何升级都必须重跑全部规范性向量。

---

## 许可证

[MIT](./LICENSE)，© Motrix 项目贡献者。本 fork 基于 [motrixapp/motrix-extension](https://github.com/motrixapp/motrix-extension)（MIT）。协议规范归 [Motrix](https://github.com/agalwood/Motrix) 项目所有。
