# 模块：手机远程

## 职责与非目标

**职责：** LAN / 中继远程、配对、`mobile/web` SPA 与 Android Compose 客户端代理到本机 harness。  
**非目标：** 不把启动页仪器风或官方 CSS Modules 整树嵌进手机 SPA / Android；不把 PTY、Browser、`writeFile` 暴露给手机。

## 用户路径

见 [../flows/remote-pair.md](../flows/remote-pair.md)。

## 架构要点

- Main：`remote.js`、`remote-shell.js`、`mobile-web.js`、`relay-client.js`；可选 `src/relay`。  
- Web：`mobile/web` + 抄写的 `--dsw-alias-*` tokens。  
- Android：`mobile/android`（`protocol` JVM 协议 + `app` Compose）。JSON 登录，Bearer 设备令牌；Git 走 `/__remote__/shell/*`。

## 实现入口

- 上列路径；[mobile/README.md](../../../mobile/README.md)

## 不变量

- 手机页与 Android 是文档化例外：语义色一致，不挂官方插件树，不用 `--boot-*`。
- 代理剥掉 `cookie` / `authorization`。Shell 白名单见 Feature 卡。

## 安全边界（LAN 模式）

LAN 模式在 `0.0.0.0` 上监听**明文 HTTP**：令牌与会话内容对同网段的窃听者可见，仅限可信局域网（家庭 / 办公内网）使用；公共 Wi‑Fi 场景应改用 HTTPS 中继或关闭远程。远程弹窗在「已开启 + 局域网」状态下常驻此警示（`lanPlaintextWarning`）。绑定地址可配置与 LAN 自签 TLS 属后续工作，未在 v1 范围。

## 门槛

- 以 [手机远程 Feature 卡](../../features/mobile-remote.md) 与当轮 QA 为准；改 UI 遵守 design-language 手机 / Android 例外段。

## 延伸阅读

- [../superpowers/specs/2026-08-20-mobile-web-client-design.md](../../superpowers/specs/2026-08-20-mobile-web-client-design.md)
- [../superpowers/specs/2026-08-23-mobile-android-client-design.md](../../superpowers/specs/2026-08-23-mobile-android-client-design.md)
- [../superpowers/plans/2026-08-25-mobile-web-scan-android-parity.md](../../superpowers/plans/2026-08-25-mobile-web-scan-android-parity.md)（Web 扫码 + 与 Android 对齐）
