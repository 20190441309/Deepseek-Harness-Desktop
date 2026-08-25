# Feature: 手机远程

| Field | Value |
| --- | --- |
| **id** | `mobile-remote` |
| **status** | `active` |
| **last verified** | 2026-08-25 — 桌面门禁 `run-remote-gate-qa.mjs`（NEG/REM-001）Pass；真机见 [remote-phone-real.md](../qa/results/2026-08-25/remote-phone-real.md)：已装 APK + 浏览器 SPA / Android 粘贴 `#offer=` 配对 + 发 `phone-native-qa-ping`（`adb reverse`；本 AP 无纯 Wi‑Fi LAN） |

## User paths

1. 侧栏底部手机图标打开 **远程** 弹窗 → 开 → 局域网（或 HTTPS 中继）→ 二维码。
2. 系统相机 / 浏览器扫码（`#offer=`）→ 登录 → `mobile/web` SPA：列会话、发消息、审批允许一次 / 拒绝；SPA 内可再扫码（`BarcodeDetector` + `getUserMedia`，仅 secure context；LAN 明文页降级为粘贴）、发图、停止运行、工作区 Git 胶囊与文件插入。设置为分组钻取 Hub。
3. Android 安装包（`mobile/android`）扫**同一条**二维码 → JSON 登录拿设备令牌 → Compose 对话 / 审批 / 传图 / 工作区 Git 胶囊。
4. 关远程后 3180 不再监听；默认 `remoteEnabled` 为关，不会在用户未打开时占口。

## Invariants

- 认证后的 HTML 是 `mobile/web` SPA，不是官方四栏 `dsh web`。`/api/*` 与 WebSocket 仍反代 `127.0.0.1:3080`。
- Token 只在 `#offer=`。Web 用 Cookie `dsh_remote`；Android 用 `Authorization: Bearer` 设备令牌（Keystore）。中继 origin 必须是 HTTPS。
- `rewriteProxyHeaders` 去掉 `cookie` / `authorization`，设备令牌不进 loopback harness。
- 已登录 `POST /__remote__/shell/<name>` 只映射白名单 git / `listDir` / `openSettings` / `openGallery` / `getConfig` / `saveConfig`。无 PTY、`writeFile`、Browser preview。
- 侧栏 `ui-settings-remote` 已加载；preload 暴露 `getRemote` / `saveRemote` / `rotateRemoteToken` / `unbindRemoteDevice`。
- 主进程构造 `RemoteGateway`，不走 `createDisabledRemote`。未开启时 `listening !== true`。
- 手机 SPA 与 Android Compose 抄 `--dsw-alias-*`，不挂官方插件树，不用启动页 `--boot-*`。Android 不套 WebView。
- Android 外观只改本机；电脑项走 shell / Host 请求。Git 胶囊 action 标签英文。

## Allowed touch

- `src/main/remote.js`、`remote-shell.js`、`mobile-web.js`、`index.js`（网关构造）、`ipc.js`、`config.js`（远程字段）
- `src/preload/index.js` — 仅 Remote IPC
- `mobile/web/` — SPA
- `mobile/android/` — Kotlin Compose 客户端
- `vendor/deepseek-harness/packages/client/ui-settings-remote/`
- `vendor/deepseek-harness/packages/bundle/web-app/cordis.patch.yml` — `ui-settings-remote` 行
- 本卡、`docs/handbook/modules/mobile-remote.md`、`docs/qa/production-acceptance-test-cases.md` 远程条

## Do not touch

- 用 WebView 套官方四栏或 HTML 原型
- 明文 HTTP 中继 origin、token 进 query
- Appearance 图源 CRUD、启动页仪器画布
- 把 PTY / Browser / `writeFile` 暴露给手机
- 邻域：composer `@`/`$`、Files Mention（除非用户扩大 `Touching`）

## Gates

| Kind | What |
| --- | --- |
| Automated | `node --test … mobile/web/**/*.test.js`；`node scripts/run-remote-gate-qa.mjs`（NEG-001+REM-001，不开配对 URL）；Android `:protocol:test` |
| Manual / QA | [TC-NEG-001](../qa/production-acceptance-test-cases.md)；[TC-REM-001](../qa/production-acceptance-test-cases.md)；扫码面 [TC-REM-002](../qa/production-acceptance-test-cases.md)…[TC-REM-003](../qa/production-acceptance-test-cases.md) |

## Sources

- Handbook: [../handbook/modules/mobile-remote.md](../handbook/modules/mobile-remote.md)、[../handbook/flows/remote-pair.md](../handbook/flows/remote-pair.md)
- Spec: [../superpowers/specs/2026-08-20-mobile-web-client-design.md](../superpowers/specs/2026-08-20-mobile-web-client-design.md)、[../superpowers/specs/2026-08-23-mobile-android-client-design.md](../superpowers/specs/2026-08-23-mobile-android-client-design.md)
- Plan: [../superpowers/plans/2026-08-20-mobile-web-client.md](../superpowers/plans/2026-08-20-mobile-web-client.md)、[../superpowers/plans/2026-08-23-mobile-android-client.md](../superpowers/plans/2026-08-23-mobile-android-client.md)、[../superpowers/plans/2026-08-25-mobile-web-scan-android-parity.md](../superpowers/plans/2026-08-25-mobile-web-scan-android-parity.md)
- Mock: [../superpowers/mocks/2026-08-20-mobile-phone.html](../superpowers/mocks/2026-08-20-mobile-phone.html)、[../superpowers/mocks/2026-08-23-android-phone.html](../superpowers/mocks/2026-08-23-android-phone.html)
- Agent Note: [vendor/deepseek-harness/.agents/notes/implemented/feature/2026-08-22-desktop-phone-remote.md](../../vendor/deepseek-harness/.agents/notes/implemented/feature/2026-08-22-desktop-phone-remote.md)
- Implementation: `src/main/remote.js`、`src/main/remote-shell.js`、`src/main/index.js`、`mobile/web/`、`mobile/android/`、`ui-settings-remote`
