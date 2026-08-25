# 模块：手机远程

## 职责与非目标

**职责：** LAN / 中继远程、配对、`mobile/web` SPA 与 Android Compose 客户端代理到本机 harness。  
**非目标：** 不把启动页仪器风或官方 CSS Modules 整树嵌进手机 SPA / Android；不把 PTY、Browser、`writeFile` 暴露给手机。

## 用户路径

见 [../flows/remote-pair.md](../flows/remote-pair.md)。

## 架构要点

- Main：`remote.js`、`remote-shell.js`、`mobile-web.js`、`relay-client.js`、`remote-tls.js`（LAN 自签证书生成/持久化，零依赖 DER 编码）；可选 `src/relay`。  
- Web：`mobile/web` + 抄写的 `--dsw-alias-*` tokens。  
- Android：`mobile/android`（`protocol` JVM 协议 + `app` Compose）。JSON 登录，Bearer 设备令牌；Git 走 `/__remote__/shell/*`。

## 实现入口

- 上列路径；[mobile/README.md](../../../mobile/README.md)

## 不变量

- 手机页与 Android 是文档化例外：语义色一致，不挂官方插件树，不用 `--boot-*`。
- 代理剥掉 `cookie` / `authorization`。Shell 白名单见 Feature 卡。

## 安全边界（LAN 模式）

LAN 模式默认在 `0.0.0.0` 上监听**明文 HTTP**：令牌与会话内容对同网段的窃听者可见，仅限可信局域网（家庭 / 办公内网）使用；公共 Wi‑Fi 场景应改用 HTTPS 中继或关闭远程。可用的收窄手段（`ui-settings-remote` 弹窗内配置）：

- **监听范围**（`remoteBindAddress`）：全部网卡（默认）/ 仅本机 `127.0.0.1` / 指定网卡 IPv4。绑仅本机时子网不可达（真机可走 `adb reverse`），弹窗换 `bindLoopbackHint`；快照 `urls` 只列绑定可达地址。
- **自签 TLS**（`remoteLanTls`，默认关）：开启后 LAN 网关走 HTTPS——ECDSA P-256 自签证书由 `src/main/remote-tls.js` 生成并持久于 `userData/remote-tls`（指纹稳定，便于浏览器记例外与后续 Android 证书固定），配对 URL 换 `https` 且 offer 携带 `fp`（证书 SHA-256）。限制：浏览器首访出自签警示页需手动继续；Android 客户端在证书固定实现前不支持 LAN TLS；中继模式绝不套 LAN TLS（中继链路本身 HTTPS）。

警示矩阵：「已开启 + LAN + 明文 + 非仅本机」常驻 `lanPlaintextWarning`；开 TLS 换 `lanTlsHint`；绑仅本机换 `bindLoopbackHint`。

Android 证书固定跟进清单（未落地，勿假装完成）：解析 offer `fp` → 自定义 `TrustManager` 按 SHA-256 固定证书 → 登录与 WebSocket 均走固定校验 → `:protocol:test` 补配对/固定用例。

## 门槛

- 以 [手机远程 Feature 卡](../../features/mobile-remote.md) 与当轮 QA 为准；改 UI 遵守 design-language 手机 / Android 例外段。

## 延伸阅读

- [../superpowers/specs/2026-08-20-mobile-web-client-design.md](../../superpowers/specs/2026-08-20-mobile-web-client-design.md)
- [../superpowers/specs/2026-08-23-mobile-android-client-design.md](../../superpowers/specs/2026-08-23-mobile-android-client-design.md)
- [../superpowers/plans/2026-08-25-mobile-web-scan-android-parity.md](../../superpowers/plans/2026-08-25-mobile-web-scan-android-parity.md)（Web 扫码 + 与 Android 对齐）
