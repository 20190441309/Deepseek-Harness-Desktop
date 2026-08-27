# Feature: 手机远程

| Field | Value |
| --- | --- |
| **id** | `mobile-remote` |
| **status** | `active` |
| **last verified** | 2026-08-27 — CI 修复：测试对齐 v2 接线（ChisaCodeRemote 取代 RemoteGateway、配对链接明示、devicesId 文案）；chisacode dist 未入库（嵌套 .gitignore），相关用例在 fresh clone 显式 skip；#offer= 用例 t.after 防泄漏挂起。 |

## User paths

1. 桌面开启配对且中继已连接 → 侧栏扫码（`http://<LAN>:3180/#offer=` v2）→ 手机系统相机打开 SPA → `DaemonClient` 经中继 E2EE 握手 → `deviceSecret` 落盘（sticky）→ 已配对态。
2. 再次打开手机 SPA（无 hash）：用已存 `deviceSecret` sticky 重连，无需再扫，直至桌面 **解除配对**。
3. Android 原生：扫完整配对 URL → 系统浏览器打开同一 SPA（原生 DaemonClient 未完成）。
4. 设置 → 远程 → 网关：局域网 | 外出（文案区分）；传输始终走中继主机。

## Invariants

- 手机 = **同协议客户端**（`mobile/web/chisacode/` + `@chisacode/client` bundle），不是旧 HTTP Host SPA。
- QR **落地页** = 本机 `mobile/web` on `:3180`（`preferredLanIp`），**永不**把中继 origin 当 SPA。
- Offer 内 `relay.endpoint` = 传输中继；WS 必须 `role=client`；`useTls` 读写一致（`=== true`）。
- Offer v1 / `POST /__remote__/login` / RemoteGateway 配对 **退役**。
- 桌面 `relayConnected` 反映真实 control socket；未连接时 UI 明示，扫码无法完成绑定。
- Android Compose 扫码框为正方形；会话仍走 Web SPA。
- Android 升级后一次性清除旧 HTTP `deviceToken`/`origin`；原生 Chat 路径不可达，扫码仅打开 Web SPA。
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
| Automated | `mobile/web/host/offer.test.js`、`login.test.js`、`pair/scan.test.js`、`chisacode/session.test.js`；`src/shared/lan.test.js`；`chisacode-remote.test.js` |
| Manual | 中继已连接 → 扫码配对 + sticky 重连 + 解除 |

## Sources

- Vendored ChisaCode client/app pairing runtime
- Kill list：[_kill-http-remote](_kill-http-remote.md)
