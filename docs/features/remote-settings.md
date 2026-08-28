# Feature: 远程设置

| Field | Value |
| --- | --- |
| **id** | `remote-settings` |
| **status** | `active` |
| **last verified** | 2026-08-28（EPIPE 止血与守护收敛）— (a) P0 根因修复：vendored `dsh-agent.ts` 的 `execSync("npm root -g")` 增加显式 `stdio`（Node 仅在 stdio 缺省时把子进程 stderr 转写进主进程 stderr，桌面断管即 uncaught EPIPE 打爆 Electron，崩溃发生在 `saveConfig({remoteEnabled:true})` 之后导致「重启即默认开启」假象）；行为回归 `remote-epipe.test.js` 用真实 broken-stderr 子进程验证（已证明对修复前代码必红）。(b) 纵深：`src/main/stdio-guard.js` 给 stdout/stderr 挂 error 监听 + uncaughtException 仅吞断管写入（其余复刻 Electron 默认错误框），`index.js` 最早安装。(c) `HarnessController.shutdown` 改调 `stopDaemon()`（原 `stop?.()` 静默 no-op 泄漏 daemon/:3180）；引导期 remote sync 失败进 dsh 日志不再被 allSettled 吞掉。(d) 桌面收敛：`applyDshVendorDir` 在自带 harness 全部 12 个 dsh vendor 包构建完备时设 `CHISACODE_DSH_VENDOR_DIR`（用户已设不动、不完备保留 npm 全局回退）——override 生效后桌面不再跑 `npm root -g`。(e) 弹窗 `enabled && !listening` 显示 `notListening` 提示且「开启」兼作重试（re-save → sync 重启 daemon）。计划与阶段 2（daemon 子进程隔离）/阶段 3（dsh provider 全量接通）见 `docs/superpowers/plans/2026-08-28-remote-epipe-hardening.md`。此前 2026-08-27（合并后收口复核）— DER INTEGER 修复（`6874270c`）完备性复审通过（全零 serial、0x00+高位保留、长 length、UTCTime 2050 边界均安全），补钉 multi-zero 剥除与高位 0x00 保留两个边界形态的回归测试，`remote-tls.test.js` 6/6 绿；`shell:rotate-remote-token`（HARNESS_ONLY，ChisaCodeRemote.rotateToken→refreshPairing）与 desktop-builtin 禁用拒绝（LAUNCHER_ONLY，写前拒绝）无串扰——saveConfig 读改写合并且主进程单线程。此前同日 — 合并汇总：(a) dsh-im 内置化落地：`ensureDesktopDshIm` 改写自有 overlay `desktop-plugins/dsh-im/desktop-dsh-im.patch.yml`（每次启动经 `--patch` 传，全量 + skip），只 strip 用户 `cordis.patch.yml` 里的遗留受管块（迁移）绝不写回；禁用名单对 dsh-im 别名不再生效（config 归一化剔除 + `shell:disable-plugin(s)` 拒绝并返回 `desktop-builtin`）；forensics 把 dsh-im 孤儿 suspect 判为内置组件损坏（`inBox`）；skip compose 契约双 overlay 双轮各恰好一次，已对真实 CLI 跑通。(b) ChisaCode 实跑修复：源码启动/打包先构建 daemon；安装包携带生产依赖；中继配置变更重启 transport；设备列表读最新 upstream store。 |

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
- dsh-im 桌面内置：insert 在自有 overlay `desktop-plugins/dsh-im/desktop-dsh-im.patch.yml`，`--patch` 叠加（full+skip）；`cordis.patch.yml` 不写受管块（只 strip 迁移）；禁插件 / Recovery 不可关（IPC 返回 `desktop-builtin`，config 归一化剔除别名）；vendor 运行时缺损 fail start（skip 修不了）。
- 渠道主操作 36px（飞书扫码无 `size=small`）。
- **断管不崩**：vendored `resolveDshVendorDir` 的 `execSync` 必须携带显式 `stdio`（tripwire 在 `remote-epipe.test.js`）；主进程 stdout/stderr 常驻 `stdio-guard`（断管类流错误吞掉，uncaughtException 仅吞断管写入、其余复刻 Electron 默认对话框）。
- 弹窗失败态可见：`enabled && !listening` 显示 `notListening` 并允许「开启」重试；`HarnessController` 关停走 `stopDaemon()`，引导期 sync 失败必进 dsh 日志。
- 桌面 harness 完备（12 个 dsh vendor 包均有 `lib/index.js`）时才设 `CHISACODE_DSH_VENDOR_DIR`；用户自设的值永远优先；不完备时不设置（保留 npm 全局回退）。

## Allowed touch

- `vendor/chisacode-remote/`、`src/main/chisacode-remote.js`、`src/main/index.js`、`src/main/mobile-web-server.js`、`src/main/stdio-guard.js`
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
| Automated | `chisacode-remote.test.js`；`remote-epipe.test.js`；`stdio-guard.test.js`；`lan.test.js`；dsh-im-desktop / skip-compose；ui-settings-remote specs |
| Manual | 中继已连接 → 扫码配对 → sticky 重连 → 解除 |

## Sources

- Plan：gateway_product_redo / fix_qr_pairing / [2026-08-28-remote-epipe-hardening](../superpowers/plans/2026-08-28-remote-epipe-hardening.md)
- Vendored：`vendor/chisacode-remote/DESKTOP-FORK.md`
