# Feature: 手机远程

| Field | Value |
| --- | --- |
| **id** | `mobile-remote` |
| **status** | `active` |
| **last verified** | 2026-08-27 — Phase 0 落地：新会话 workspace/provider(/mode) chooser（`fetchWorkspaces` + `getProvidersSnapshot` → 显式 `createAgent`）、真实权限模式（snapshot `availableModes/currentModeId` + `setAgentMode` 失败回滚，删除本地假切换）、连接三态条与重连后权威 resync（`subscribeConnectionStatus` → `fetchAgents` + 当前 timeline），草稿按 serverId+sessionId 本地保留。86 单测 + 32 项 fake-daemon 浏览器集成检查全绿；真机 relay 链路 BLOCKED，见 `docs/qa/results/2026-08-27/mobile-web-phase0.md`。 |

## User paths

1. 桌面开启配对且中继已连接 → 侧栏扫码（`http://<LAN>:3180/#offer=` v2）→ 手机系统相机打开 SPA → `DaemonClient` 经中继 E2EE 握手 → `deviceSecret` 落盘（sticky）→ 已配对态。
2. 再次打开手机 SPA（无 hash）：用已存 `deviceSecret` sticky 重连，无需再扫，直至桌面 **解除配对**。
3. Android：原生扫码或粘贴完整配对 URL → 提取 offer 后由应用内 WebView 打开 APK 内置的同一 SPA → 后续启动直接从安全 asset origin 触发 SPA sticky 重连，不必重新访问 LAN `:3180` 页面。
4. 设置 → 远程 → 网关：局域网 | 外出（文案区分）；传输始终走中继主机。
5. 手机「新会话」→ chooser sheet：`fetchWorkspaces` 列工作区（名称 · 项目 · 分支 · cwd）→ `getProvidersSnapshot(cwd)` 列 ready 提供方 → 可选权限模式（snapshot `modes`/`defaultModeId`）→ 把选中的 `workspaceId/cwd/provider(/modeId)` 显式传给 `DaemonClient.createAgent` → 打开新会话。
6. 手机工作区 → daemon checkout/file RPC 提供 Git 状态、提交、拉取、推送、创建 PR、切换已有分支和根目录文件；普通分支创建与电脑窗口操作禁用并提示在电脑端完成。
7. 会话权限模式：composer chip 与设置「权限」pane 显示 agent snapshot 的当前 mode；切换调用 `setAgentMode`，daemon 拒绝时回滚并显示错误原文；`mode_changed` 流事件写回 UI。
8. 断线：chat 顶部连接条显示「连接已断开 / 正在重新连接」，发送被拒绝且草稿保留（按 serverId+sessionId 存 localStorage）；client 自动重连成功后自动重拉 agent 目录与当前会话 timeline 并提示「已重新连接并同步」。

## Invariants

- 手机 = **同协议客户端**（`mobile/web/chisacode/` + `@chisacode/client` bundle），不是旧 HTTP Host SPA。
- SPA 不得从 `host/offer.js` / `host/login.js` 进入 v1 Cookie 登录；扫描结果保留完整 `#offer=` URL 后交给 `parseConnectionOfferFromUrl`。
- QR **落地页** = 本机 `mobile/web` on `:3180`（`preferredLanIp`），**永不**把中继 origin 当 SPA。
- Offer 内 `relay.endpoint` = 传输中继；WS 必须 `role=client`；`useTls` 读写一致（`=== true`）。
- Offer v1 / `POST /__remote__/login` / RemoteGateway 配对 **退役**。
- 桌面 `relayConnected` 反映真实 control socket；未连接时 UI 明示，扫码无法完成绑定。
- Android Compose 扫码框为正方形；会话走 APK 构建时纳入的同一 Web SPA（`WebViewAssetLoader` HTTPS origin），不另写一套 DaemonClient，也不依赖冷启动时仍能访问 LAN 落地页。
- Android 升级后一次性清除旧 HTTP `deviceToken`/`origin`；不保留 `LoginClient`、Bearer `/api/*`、`/__remote__/shell/*` 原生 Chat 死路径。
- Android 原生层只保存内置 SPA 已启用标记，不保存 offer；`deviceSecret` 由 SPA 保存在稳定 WebView asset origin 的 localStorage，直到桌面撤销或 SPA 断开设备。
- ChisaCode 会话创建、Git 与文件不得回退到 `callUnary` / `callShell`；daemon 返回的结构化错误必须进入可见 banner/toast。
- 权限模式唯一来源是 agent snapshot；UI 不得持有本地假 mode 状态，`setAgentMode` 失败必须回滚并显示 daemon 错误。
- 新会话必须经 workspace/provider chooser 显式选择；不得复用“第一条 agent”的 `provider/cwd` 猜测目标。
- 重连（`subscribeConnectionStatus` 回到 connected）后必须权威重同步（`fetchAgents` + 当前 timeline）；断线时发送必须被可见拒绝，不得假装在线；未发送草稿不得丢失。
- 普通分支创建和打开电脑设置/图库没有 daemon RPC：控件必须禁用并写明电脑端操作，不得抛旧 Host RPC 错误或伪报成功。
- 设计语言仍抄 `--dsw-alias-*`。

## Allowed touch

- `mobile/web/`（含 `chisacode/`）、`scripts/bundle-chisacode-mobile-client.mjs`
- `src/main/chisacode-remote.js`、`src/main/mobile-web-server.js`、`src/shared/lan.js`
- `vendor/chisacode-remote/`、`ui-settings-remote`、本卡、QA 远程条
- `mobile/android/`（扫码 handoff）

## Do not touch

- 恢复 HTTP Bearer Host SPA 为主路径
- 指着 `app.chisacode.sh` / `relay.chisacode.sh` 冒充完成
- 把中继 IP 当作 QR `appBaseUrl`

## Gates

| Kind | What |
| --- | --- |
| Automated | `mobile/web/**/*.test.js`（含 `chisacode/session.test.js`、`chisacode/parity.test.js`、`chisacode/controller.test.js`、`pair/scan.test.js`）；Android JVM tests；`src/shared/lan.test.js`；`chisacode-remote.test.js` |
| Manual | 中继已连接 → 扫码配对 → chooser 新建会话（多 workspace）→ 切换权限模式 → Git/文件 → 断网重连 resync + 草稿保留 → sticky 重连 → 解除 |

## Sources

- Vendored ChisaCode client/app pairing runtime
- Kill list：[_kill-http-remote](_kill-http-remote.md)
- Gap analysis：[2026-08-27-mobile-web-desktop-gap-analysis](../superpowers/plans/2026-08-27-mobile-web-desktop-gap-analysis.md)
- Phase 0 执行：[2026-08-27-mobile-web-phase0-execution](../superpowers/plans/2026-08-27-mobile-web-phase0-execution.md)
