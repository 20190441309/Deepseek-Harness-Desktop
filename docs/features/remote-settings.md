# Feature: 远程设置

| Field | Value |
| --- | --- |
| **id** | `remote-settings` |
| **status** | `active` |
| **last verified** | 2026-08-27 — ChisaCode 实跑修复：源码启动/打包先构建 daemon；安装包携带生产依赖；中继配置变更重启 transport；设备列表读最新 upstream store。 |

## User paths

1. 设置 → 「远程」（`remote`）→ **网关**：选 **局域网 / 外出**（文案区分；扫码传输都经中继）；中继主机默认内置 `125.124.85.212:8411`。**无宿主令牌墙**。
2. 设置 → 「远程」→ **消息渠道**：桌面内置 `@xmanrui/dsh-im` 完整 IM UI（九渠 + AI Office）；无商店品牌头。
3. 侧栏底部手机图标打开配对弹窗：开关 → 中继状态 → 扫码二维码 / 可复制配对链接 → 已配对设备 / 解除配对。

## Invariants

- 设置 section id `remote`；子 slot `settings.remote.tab`：`gateway`（order 0）、`channels`（order 10）。
- **配对协议 = ChisaCode offer v2**：主进程 `ChisaCodeRemote` 启全量 `createChisaCodeDaemon`；QR `appBaseUrl` = `preferredLanIp():3180` mobile/web；**禁止**把中继 origin 当 SPA。
- `snapshot.relayConnected` / `relayError` 反映真实 relay control；未连接时弹窗明示。
- 源码启动若缺 `dist` 会构建 ChisaCode server；pack/dist 额外组装并验证 production daemon 依赖，禁止靠构建机残留产物。
- 侧栏 QR 仅客户端 `qrSvg(pairingUrl)`（`includeQr: false`）。
- 外出中继禁止 `chisacode.sh` / 上游 `account_id`。AGPL：`AGPL-SHIPPING.md`。内置 `125…:8411` 可作为 **传输默认**，不可作 SPA。
- 粘性：`deviceSecret` 直至用户解除配对；刷新 QR 只换短期 pairing token。
- dsh-im 一等公民：`--patch` 叠加（full+skip）；禁插件 / Recovery 不可关。
- 渠道主操作 36px（飞书扫码无 `size=small`）。

## Allowed touch

- `vendor/chisacode-remote/`、`src/main/chisacode-remote.js`、`src/main/index.js`、`src/main/mobile-web-server.js`
- `vendor/deepseek-harness/packages/client/ui-settings-remote/`
- `src/main/remote-patch.js`、`config.js`、`src/shared/lan.js`、`ipc.js` / preload Remote IPC
- `src/main/dsh-im-desktop.js`、`harness-controller.js`、`plugin-forensics.js`
- `vendor/dsh-im/`、本卡、[mobile-remote](mobile-remote.md)、[_kill-http-remote](_kill-http-remote.md)

## Do not touch

- 自研中继冒充移植；daemon/hello 切片
- 恢复 HTTP 宿主令牌墙
- 把中继 IP 填进 `remoteAppBaseUrl` / QR 落地
- 把 dsh-im 退回可禁用户插件

## Gates

| Kind | What |
| --- | --- |
| Automated | `chisacode-remote.test.js`；`lan.test.js`；dsh-im-desktop / skip-compose；ui-settings-remote specs |
| Manual | 中继已连接 → 扫码配对 → sticky 重连 → 解除 |

## Sources

- Plan：gateway_product_redo / fix_qr_pairing
- Vendored：`vendor/chisacode-remote/DESKTOP-FORK.md`
