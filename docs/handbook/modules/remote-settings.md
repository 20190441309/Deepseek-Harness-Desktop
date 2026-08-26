# 远程设置（Settings → Remote）

设置分区 `remote` 承载连接方式、网关高级项与**桌面内置** IM 渠道（`vendor/dsh-im`，file:// cordis）；侧栏手机弹窗只负责开关、设备与扫码配对。产品契约见 [Feature: remote-settings](../../features/remote-settings.md)，配对网关见 [手机远程](mobile-remote.md)。

## 结构

| 标签 | id | 所有者 |
| --- | --- | --- |
| 网关 | `gateway` | `ui-settings-remote` |
| 消息渠道 | `channels` | 桌面一等公民 `@xmanrui/dsh-im`（`dsh-im-desktop.js` file://，不再软预置拷贝） |

加载入口：`src/main/dsh-im-desktop.js` → managed cordis 包名 + `node_modules` junction 到 `vendor/dsh-im`。缺依赖挡 `dsh web` 启动。市场同名包 `DROPPED`。
