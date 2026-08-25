# Feature: 手机远程

| Field | Value |
| --- | --- |
| **id** | `mobile-remote` |
| **status** | `parked` |
| **last verified** | 2026-08-23 — `node --test src/main/remote.test.js src/main/remote-shell.test.js` 29/29；`mobile/android` `gradlew :protocol:test` 24/24，`:app:assembleDebug`；USB 真机 `23124RN87C` 重装 debug APK：对话页汉堡/发丝顶栏/胶囊作曲器（只读·模型芯片、info 发送），抽屉搜索+新会话+底栏工作区/设置，设置分组钻取+断开危险行，工作区 32px Git 胶囊英文 `Commit & push` + 底部 Git 操作 sheet。未点 Commit/Push；无挂起审批 |

## User paths

> **停放（parked）：** `REMOTE_FEATURE_ENABLED = false`，侧栏远程入口隐藏、网关默认不监听（与 [README 索引](README.md)、QA 表 TC-REM-001…003 N/A 口径一致）。以下路径描述解禁后的产品形态；停放期间开发与测试直接构造 `RemoteGateway`（`remote.test.js` 做法），不翻产品开关。

1. 侧栏底部手机图标打开 **远程** 弹窗 → 开 → 局域网（或 HTTPS 中继）→ 二维码。
2. 系统相机 / 浏览器扫码（`#offer=`）→ 登录 → `mobile/web` SPA：列会话、发消息、审批允许一次 / 拒绝；SPA 内可再扫码（`BarcodeDetector` + `getUserMedia`，仅 secure context；LAN 明文页降级为粘贴）、发图、停止运行、工作区 Git 胶囊与文件插入。设置为分组钻取 Hub（`settings.describe` 只读行已下线）。
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
| Automated | `node --test src/main/remote.test.js src/main/remote-shell.test.js src/main/ipc.test.js src/preload/shell-api.test.js src/shared/post-merge-ui.test.js src/main/composer-official-qa.test.js src/main/release-ui-walk.test.js mobile/web/**/*.test.js`（含 `mobile/web/shell/remote-shell.test.js`、`git/vcs-parse.test.js`、`git/quick.test.js`、`host/prompt.test.js`、`pair/scan.test.js`、`ui/settings-hub.test.js`、`fence.test.js`）；Android：`mobile/android` 下 `./gradlew :protocol:test`（Host / offer / fold / Git JSON） |
| Manual / QA | [TC-NEG-001](../qa/production-acceptance-test-cases.md)（默认不监听）；[TC-REM-001](../qa/production-acceptance-test-cases.md) … [TC-REM-003](../qa/production-acceptance-test-cases.md)；Android 扫码 → 列表 → 发文本 → 审批 → 传图 → Commit 对话框 |

## Sources

- Handbook: [../handbook/modules/mobile-remote.md](../handbook/modules/mobile-remote.md)、[../handbook/flows/remote-pair.md](../handbook/flows/remote-pair.md)
- Spec: [../superpowers/specs/2026-08-20-mobile-web-client-design.md](../superpowers/specs/2026-08-20-mobile-web-client-design.md)、[../superpowers/specs/2026-08-23-mobile-android-client-design.md](../superpowers/specs/2026-08-23-mobile-android-client-design.md)
- Plan: [../superpowers/plans/2026-08-20-mobile-web-client.md](../superpowers/plans/2026-08-20-mobile-web-client.md)、[../superpowers/plans/2026-08-23-mobile-android-client.md](../superpowers/plans/2026-08-23-mobile-android-client.md)、[../superpowers/plans/2026-08-25-mobile-web-scan-android-parity.md](../superpowers/plans/2026-08-25-mobile-web-scan-android-parity.md)
- Mock: [../superpowers/mocks/2026-08-20-mobile-phone.html](../superpowers/mocks/2026-08-20-mobile-phone.html)、[../superpowers/mocks/2026-08-23-android-phone.html](../superpowers/mocks/2026-08-23-android-phone.html)
- Agent Note: [vendor/deepseek-harness/.agents/notes/implemented/feature/2026-08-22-desktop-phone-remote.md](../../vendor/deepseek-harness/.agents/notes/implemented/feature/2026-08-22-desktop-phone-remote.md)
- Implementation: `src/main/remote.js`、`src/main/remote-shell.js`、`src/main/index.js`、`mobile/web/`、`mobile/android/`、`ui-settings-remote`
