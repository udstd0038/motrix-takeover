<div>
  <img src="./public/app-icon.png" alt="Motrix Takeover" width="256" />
  <h1>Motrix Takeover</h1>
  <p>一款把浏览器下载一键交给 Motrix 的 Firefox 扩展</p>
</div>

[![GitHub release](https://img.shields.io/github/v/release/udstd0038/motrix-takeover.svg)](https://github.com/udstd0038/motrix-takeover/releases) [![Total Downloads](https://img.shields.io/github/downloads/udstd0038/motrix-takeover/total.svg)](https://github.com/udstd0038/motrix-takeover/releases) [![License](https://img.shields.io/github/license/udstd0038/motrix-takeover.svg)](./LICENSE)

[English](./README.md) | 简体中文

## Overview

Motrix Takeover 把"下载这个"变成一次点击：文件不再走浏览器自带的下载管理器，而是交给 [Motrix](https://motrix.app) —— 你的登录会话也会一并带过去，所以需要登录才能下的文件照样能下。它还能干浏览器干不了的事，比如用 FFmpeg 把 HLS/DASH 流媒体视频合成一个完整文件。

**Motrix Takeover 是官方 [Motrix Extension](https://github.com/motrixapp/motrix-extension) 的社区 fork。** 官方扩展正随 Motrix 2 逐步上线，fork 创建时其商店链接尚未发布。本仓库以独立身份提供全功能扩展，让你今天就能构建、安装并配对使用。

扩展实现了 Motrix 项目定义的两个开放协议：

- **MDXP**（Motrix 下载交换协议）—— 基于 JSON-RPC 2.0 的应用层协议，负责提交下载、管理任务与推送进度；
- **MBP1**（Motrix 桥接配对协议 v1）—— SPAKE2 口令认证密钥交换 + AES-256-GCM 封装，保护浏览器与 Motrix 桥之间的连接。

配对协议与安全实现和官方代码库完全一致（官方实现经过了六轮独立对抗性密码学审查）。本 fork 只改了扩展身份。

## 🧪 状态

Motrix 2 目前处于 beta 阶段。本 fork 已在 **Motrix 2.0.0-beta.32**（Windows 11、Firefox 154）上完成全链路真机验证。经 Mozilla 签名的预构建安装包发布在 [GitHub Releases](https://github.com/udstd0038/motrix-takeover/releases)：下载最新的 `motrix-takeover-<版本>-signed.xpi`，按下面的配对指南操作即可。

| | 官方扩展 | 本 fork |
|---|---|---|
| Gecko ID（Firefox） | `motrix-extension@motrix.app` | `motrix-takeover@local.dev` |
| 原生消息（NM）宿主名 | `app.motrix.bridge` | `app.motrix.bridge.takeover` |
| 显示名称 | Motrix Extension | Motrix Takeover |
| Motrix 身份判定 | `official` | `attested-non-official`（可正常配对，仅无官方品牌标识） |
| 协议 / 密码学代码 | — | 未改动 |

## ✨ Features

- 📥 一键接管下载 —— 符合条件的 Firefox 下载直接交给 Motrix，可设最小文件大小阈值与按域名的排除列表
- 🔐 带登录态的下载 —— 重放请求头与 Cookie，登录后才能下载的文件无需手动复制 Cookie
- 🎬 流媒体视频（HLS/DASH）—— Motrix 下载分片后用 FFmpeg 合成音视频
- 🧲 磁力链接 —— 直接进入种子流程
- 🖱 右键菜单 —— 对任意链接"用 Motrix 下载"
- ✍️ 手动任务 —— 在弹窗里粘贴 HTTP(S) 或 `magnet:` 链接
- 🔍 页面资源嗅探 —— 列出当前页面已加载的视频 / 音频 / 图片，可批量提交
- 🖥 远程 Motrix Server —— 通过 `ws://` / `wss://` 配对（Cookie 与请求头默认关闭，需对每个 Server 显式授权）
- ↩️ 移交失败兜底 —— Motrix 无法接收时自动退回浏览器下载，并用大白话说明原因（"会话已过期"、"受 DRM 保护"等）
- 🌍 16 种界面语言，含简体中文与英文

## 🧩 Ecosystem

Motrix Takeover 与官方扩展接入同一个 Motrix 生态：

| 项目 | 分发形态 | 作用 |
|---------|--------------|--------------|
| [Motrix](https://github.com/agalwood/Motrix) | 桌面应用 / 无头服务器 | 拥有下载引擎、桥接与配对对话框的下载管理器 |
| [`@motrix/mdxp`](https://github.com/motrixapp/mdxp) | npm 包 | 定义 MDXP 的 JSON-RPC 2.0 线协议 schema 与 Zod 类型 |
| [Motrix Extension](https://github.com/motrixapp/motrix-extension) | 浏览器扩展 | 本 fork 所基于的官方 Chrome / Edge / Firefox 扩展 |
| **Motrix Takeover**（本仓库） | GitHub Releases 上的签名 `.xpi` | 独立身份的社区 fork，今天即可安装 |

## 📦 Installation

### 从签名发行包安装（推荐）

1. 从[最新 Release](https://github.com/udstd0038/motrix-takeover/releases/latest) 下载 `motrix-takeover-<版本>-signed.xpi`；
2. 用 Firefox 打开它（或拖入 Firefox 窗口，或在 **about:addons → 齿轮 → 从文件安装附加组件** 中选择）；
3. 在权限提示中点击 **Add**；
4. 注册原生消息宿主（Windows PowerShell）：

   ```powershell
   powershell -ExecutionPolicy Bypass -File .\scripts\register-nm-host.ps1
   ```

5. 与 Motrix 配对：点击工具栏图标 → **Connect**，输入 Motrix 审批对话框中显示的 8 位配对码。

每个 Release 都附带 `SHA256SUMS.txt` 校验和文件。

### 从源码构建

开发环境要求 Node.js 22.13+ 与 pnpm 11（版本号见 `package.json` 的 `packageManager` 字段）。

```bash
git clone https://github.com/udstd0038/motrix-takeover.git
cd motrix-takeover

pnpm install --frozen-lockfile
pnpm run build:firefox     # 产物输出到 dist/firefox/
```

通过 **about:debugging#/runtime/this-firefox → 临时载入附加组件 → dist/firefox/manifest.json** 加载未打包版本。临时附加组件在 Firefox 重启后会失效；长期使用请安装签名发行包。

### 配对说明

- Motrix 需保持运行，且 **设置 → 集成 → 浏览器扩展 →「用浏览器扩展发送下载到 Motrix」** 处于开启状态（默认就是开的）。
- 8 位配对码即口令：SPAKE2 交换中的密钥确认本身就是批准证明——没有第二次"批准"点击。
- 在 **Motrix → 设置 → 集成 → 浏览器扩展 → 受信任的扩展** 中添加本扩展 ID 是**可选的**：不加也能正常配对，身份显示为 `attested-non-official`。
- 首次配对后，重连使用长期凭据自动完成，无需再输码。

## 🛠 Development

```bash
pnpm dev              # Chromium 开发构建
pnpm dev:firefox      # Firefox 开发构建
pnpm test             # 2000+ 单元测试，含全部 MBP1 规范性向量
pnpm lint             # Biome 检查
pnpm run build:firefox
```

主要目录：`src/background/`（配对、连接、下载移交、任务控制）、`src/popup/`、`src/options/`、`src/content/`（页面资源探测）、`src/adapters/`（站点适配器）、`src/background/mbp1/`（MBP1 协议实现）。

密码学依赖版本由协议规范锁定（`@noble/curves@2.4.0`、`@noble/hashes@2.4.0`），任何升级都必须重跑全部规范性向量。`scripts/test-mbp1-full-pair.mjs` 与 `devtools/` 目录保留了对真实 Motrix 2.0.0-beta.32 做验证用的完整自动化工具。

## 🔧 Tech stack

| 领域 | 技术栈 |
|------|-------|
| 扩展运行时 | Manifest V3（Firefox `background.scripts` + `type: module`） |
| UI | React 19 + Tailwind CSS 4 + shadcn 风格组件 |
| 语言 | 严格模式 TypeScript |
| 构建系统 | Vite 8 + `@crxjs/vite-plugin`，独立的 `chromium` / `firefox` / `webstore` 变体 |
| 校验 | Zod 4（设置、帧与线协议 schema） |
| 协议 | `@motrix/mdxp`（JSON-RPC 2.0）运行于 AES-256-GCM 封装之上 |
| 配对密码学 | SPAKE2（edwards25519，`@noble/curves` 2.4.0）、scrypt/HKDF/HMAC（`@noble/hashes` 2.4.0） |
| 本地传输 | Native Messaging（Motrix 自带 `motrix-native-host`）→ `motrix-bridge.v1` WebSocket |
| 国际化 | i18next + react-i18next，16 种语言 |
| 质量工具 | Biome、Vitest |

扩展分为两个严格分层，与 Motrix 代码库的分层思路一致：

```
popup / options / content（React UI + 页面嗅探）
   |  运行时消息（MessageBus）
background service worker（MBP1 配对、MDXP 连接、下载移交）
   |  native messaging / WebSocket（motrix-bridge.v1）
Motrix 桥接（桌面应用）
   |
aria2（下载引擎）
```

## 🤝 Contributing

这是社区 fork——欢迎在本仓库提交 issue 与 pull request。协议层面的缺陷与功能建议请反馈到上游：[官方扩展仓库](https://github.com/motrixapp/motrix-extension)与 [Motrix 仓库](https://github.com/agalwood/Motrix)。

## 📜 License

[MIT](./LICENSE) © 2026-present Motrix 项目贡献者

第三方许可信息见 [`THIRD_PARTY_NOTICES.md`](./THIRD_PARTY_NOTICES.md)。本 fork 基于 [motrixapp/motrix-extension](https://github.com/motrixapp/motrix-extension)（MIT）；协议规范归 [Motrix](https://github.com/agalwood/Motrix) 项目所有。
