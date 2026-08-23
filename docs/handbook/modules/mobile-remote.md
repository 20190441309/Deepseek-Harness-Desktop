# 模块：手机远程

## 职责与非目标

**职责：** 停放状态下隐藏侧栏远程入口，并保证网关不监听。重新打开后才提供 LAN / 中继远程、配对、`mobile/web` SPA 代理到本机 harness。  
**非目标：** 不把启动页仪器风或官方 CSS Modules 整树嵌进手机 SPA。停放时不向用户提供配对路径。

## 用户路径

停放：侧栏无手机图标，3180 不监听。重新打开后的配对步骤见 [../flows/remote-pair.md](../flows/remote-pair.md)。

## 架构要点

- 开关：`src/main/config.js` 与 `src/preload/index.js` 的 `REMOTE_FEATURE_ENABLED`（必须同步）。  
- Main：`remote.js`、`mobile-web.js`、`relay-client.js`；可选 `src/relay`。  
- 前端：`mobile/web` + 抄写的 `--dsw-alias-*` tokens。停放时 preload 不暴露 Remote IPC，插件不注册入口。

## 实现入口

- 上列路径；[mobile/README.md](../../../mobile/README.md)

## 不变量

- 停放时 `available === false`、不监听、无侧栏入口。  
- 手机页是文档化例外：语义色一致，不挂官方插件树，不用 `--boot-*`。

## 门槛

- 以 [手机远程 Feature 卡](../../features/mobile-remote.md) 与当轮 QA 为准；改 UI 遵守 design-language 手机例外段。

## 延伸阅读

- [../superpowers/specs/2026-08-20-mobile-web-client-design.md](../../superpowers/specs/2026-08-20-mobile-web-client-design.md)
