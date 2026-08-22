# 模块：dshbot

## 职责与非目标

**职责：** 仓库仍打包 bot 联系人 / 群房间插件源；当前产品把侧栏入口藏掉，启动时从 web profile 卸掉预置。  
**非目标：** 不做成独立聊天产品壳；不扩散非官方视觉；隐藏期间不承诺用户能打开机器人页。

## 用户路径

- 启动后侧栏没有「机器人 / Bots」页签。  
- 契约见 Feature 卡 `dshbot` 与 `TC-EXT-007`（负向）。

## 架构要点

- `hideDshbotPlugin` 去掉 managed cordis 块，并从 profile `bundles` / `dependencies` 去掉 `dshbot`。  
- `ensureDshbotPlugin` 仍可把源拷进 profile；启动路径不再调用它。  
- 插件源在 `vendor/dshbot`。

## 实现入口

- `src/main/dshbot-preset.js`、`harness-controller.js`  
- `vendor/dshbot/`

## 不变量

- Feature card：[../../features/dshbot.md](../../features/dshbot.md)  
- 预置源随桌面交付；隐藏不等于从安装包删除源。

## 门槛

- QA：`TC-EXT-007`

## 延伸阅读

- [../superpowers/specs/2026-08-19-dshbot-design.md](../../superpowers/specs/2026-08-19-dshbot-design.md)
