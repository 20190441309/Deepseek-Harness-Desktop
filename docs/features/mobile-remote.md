# Feature: 手机远程

| Field | Value |
| --- | --- |
| **id** | `mobile-remote` |
| **status** | `active` |
| **last verified** | 2026-08-27 — 手机 SPA 补齐 daemon 原生 createAgent、checkout Git 与 file explorer；普通分支创建/电脑窗口控制无协议能力时诚实禁用。Android APK 继续由安全 WebView asset origin 承载同一 v2 SPA。 |

## User paths

1. 桌面开启配对且中继已连接 → 侧栏扫码（`http://<LAN>:3180/#offer=` v2）→ 手机系统相机打开 SPA → `DaemonClient` 经中继 E2EE 握手 → `deviceSecret` 落盘（sticky）→ 已配对态。
2. 再次打开手机 SPA（无 hash）：用已存 `deviceSecret` sticky 重连，无需再扫，直至桌面 **解除配对**。
3. Android：原生扫码或粘贴完整配对 URL → 提取 offer 后由应用内 WebView 打开 APK 内置的同一 SPA → 后续启动直接从安全 asset origin 触发 SPA sticky 重连，不必重新访问 LAN `:3180` 页面。
4. 设置 → 远程 → 网关：局域网 | 外出（文案区分）；传输始终走中继主机。
5. 手机「新会话」→ 从已有 agent，或最近工作区 + ready provider，发现 `provider`/`cwd` → `DaemonClient.createAgent` → 打开新会话。
6. 手机工作区 → daemon checkout/file RPC 提供 Git 状态、提交、拉取、推送、创建 PR、切换已有分支和根目录文件；普通分支创建与电脑窗口操作禁用并提示在电脑端完成。

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
| Automated | `mobile/web/**/*.test.js`（含 `chisacode/session.test.js`、`chisacode/parity.test.js`、`pair/scan.test.js`）；Android JVM tests；`src/shared/lan.test.js`；`chisacode-remote.test.js` |
| Manual | 中继已连接 → 扫码配对 → 新建会话 → Git/文件 → sticky 重连 → 解除 |

## Sources

- Vendored ChisaCode client/app pairing runtime
- Kill list：[_kill-http-remote](_kill-http-remote.md)
