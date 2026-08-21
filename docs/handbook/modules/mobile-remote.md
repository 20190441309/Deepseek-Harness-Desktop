# 模块：手机远程

## 职责与非目标

**职责：** LAN / 中继远程、配对、`mobile/web` SPA 代理到本机 harness。  
**非目标：** 不把启动页仪器风或官方 CSS Modules 整树嵌进手机 SPA。

## 用户路径

见 [../flows/remote-pair.md](../flows/remote-pair.md)。

## 架构要点

- Main：`remote.js`、`mobile-web.js`、`relay-client.js`；可选 `src/relay`。  
- 前端：`mobile/web` + 抄写的 `--dsw-alias-*` tokens。

## 实现入口

- 上列路径；[mobile/README.md](../../../mobile/README.md)

## 不变量

- 手机页是文档化例外：语义色一致，不挂官方插件树，不用 `--boot-*`。

## 门槛

- 以 mobile design 与当轮 QA 为准；改 UI 遵守 design-language 手机例外段。

## 延伸阅读

- [../superpowers/specs/2026-08-20-mobile-web-client-design.md](../../superpowers/specs/2026-08-20-mobile-web-client-design.md)
