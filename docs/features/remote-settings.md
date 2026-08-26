# Feature: 远程设置

| Field | Value |
| --- | --- |
| **id** | `remote-settings` |
| **status** | `active` |
| **last verified** | 2026-08-26 — 默认中继一键：`http://125.124.85.212:8411`；渠道页设计语言收口；网关凭据先于连接方式。 |

## User paths

1. 设置 → 「远程」（`remote`）→ **网关**：先填中继地址／宿主令牌，再选连接方式（局域网／服务器中继），然后端口、绑定网卡、LAN TLS、轮换 pairing token。未齐中继凭据时「服务器中继」禁用，并按缺口文案说明。
2. 设置 → 「远程」→ **消息渠道**：桌面内置 `@xmanrui/dsh-im` 的完整 IM UI（微信／飞书／钉钉／企业微信／QQ／Slack／Telegram／Discord／WhatsApp + AI Office，不裁剪）；无独立插件商店头（无 DSH-IM 大标题／口号／GitHub）。
3. 侧栏底部手机图标打开配对弹窗：仅开关／已连接设备／二维码。

## Invariants

- 设置 section id `remote`；子 slot `settings.remote.tab`：`gateway`（order 0）由 `ui-settings-remote` 自注入，`channels`（order 10）由 `vendor/dsh-im` 注入。
- dsh-im 是桌面**一等公民**：`src/main/dsh-im-desktop.js` 用 managed cordis 包名 `@xmanrui/dsh-im` + profile `node_modules` **junction 到 `vendor/dsh-im`**；**禁止**软拷贝进 `desktop-plugins` 当主路径；缺依赖 **挡启动**（不得只打日志继续）。（Loader 不接受目录 `file://`，故用包名+junction，仍指向仓库内置源码。）
- `skipUserPlugins` 恢复启动仍接线 dsh-im；仅 `disabledPlugins` 含 IM 别名时跳过。
- 市场安装 `@xmanrui/dsh-im` / `dsh-im` / `xmanrui-dsh-im` 在 `DROPPED` 中拒绝。
- dsh-im **不**再单独注册 `settings.section`「IM机器人」；UI 只挂在「消息渠道」标签。
- 配对开关与二维码不进设置；连接方式与高级项不进侧栏弹窗。
- `remoteRelayToken` 只经 `saveRemote` 单向写入凭据层；快照暴露 `relayConfigured`、`relayTokenSet`、`defaultRelayUrl`，不回显令牌明文。`relayConfigured` 仍要求 URL+令牌双条件。
- 网关提供「使用默认中继」：一键写入桌面默认 origin `http://125.124.85.212:8411`（唯一允许的 HTTP 中继例外）；自建中继仍须 HTTPS。
- 消息渠道页无商店品牌头、无外链 GitHub；渠道轨不带组件内私有滚动条样式。
- 消息渠道内部主操作对齐 [design-language](../design-language.md)：胶囊主钮走 `--dsw-alias-button-primary-fill`；禁止 Ant `#1677ff` / 渠道品牌色当 CTA 底；品牌色仅用于轨上识别图标。
- 安装落点是桌面 `dsh-home/profiles/web`（见 [dsh-home](dsh-home.md)）。
- 网关走 `--dsw-alias-*` 与 `ui-primitives`（含 `SettingsSelect`）；渠道页本轮为 token 等价胶囊（未接 primitives JSX）。

## Allowed touch

- `vendor/deepseek-harness/packages/client/ui-settings-remote/`
- `vendor/deepseek-harness/packages/client/ui-settings/` — 仅 `settings.remote.tab` 类型声明
- `src/main/remote.js`、`remote-patch.js`、`config.js`（远程字段）、`ipc.js` / `src/preload/index.js`（Remote IPC）
- `src/main/dsh-im-desktop.js`、`dsh-im-preset.js`（re-export）、`harness-controller.js`、`index.js`、`plugin-forensics.js`、`plugins.js`（DROPPED）、`plugin-runtime-files.js`
- `vendor/dsh-im/`（钉死 npm + 桌面 registration 补丁）
- `scripts/setup-harness.js`、`scripts/after-pack.js`、`package.json` extraResources
- 本卡、[mobile-remote](mobile-remote.md)、handbook 设置附录 / 远程章、相关 QA

## Do not touch

- 自研 QQ/飞书/微信协议；裁剪 dsh-im 九渠道
- 把开关/二维码迁进设置，或把连接方式/高级项塞回侧栏弹窗
- Appearance / 市场窗 / 启动页仪器画布（除非用户扩大 Touching）
- 把 dsh-im 退化回「软预置失败不挡启动」

## Gates

| Kind | What |
| --- | --- |
| Automated | `ui-settings-remote` client specs；`src/main/dsh-im-desktop.test.js`；harness-controller IM 失败挡启动；remote-patch；`qa:source` / walk 含 `remote` |
| Manual / QA | TC-EXT-009（双标签 + 九渠入口）；中继未配置时网关禁用中继；CDP 烟测；IM 扫码仍走 dsh-im（不替代 TC-REM） |

## Sources

- Plan：远程设置整块重做（详细执行规格）
- Upstream IM：[xmanrui/dsh-im](https://github.com/xmanrui/dsh-im)
- Pairing：[mobile-remote](mobile-remote.md)
- Implementation：`ui-settings-remote`、`src/main/dsh-im-desktop.js`
