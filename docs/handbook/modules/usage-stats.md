# 模块：用量统计

## 职责与非目标

**职责：** 内置改版 `dsh-usage-panel` 作为设置 section `usage-stats`；跨会话 Token KPI / 热力图 / 模型拆分 / 导出。  
**非目标：** 余额与花费；改上游 token-meter；侧栏或会话浮卡。

## 用户路径

设置 → 「用量统计」。无用量时空态。数据只读本机会话投影（UTC 日桶）。

## 架构要点

- 预置：`usage-panel-preset.js` + `vendor/dsh-usage-panel`。  
- Host：`ctx.sessionProjections` key `usagePanel`；RPC `/usage-stats` loopback。  
- Client：`settings.section` id `usage-stats`；`ui-primitives` + token。  
- Feature card：[../../features/usage-stats.md](../../features/usage-stats.md)

## 实现入口

- `src/main/usage-panel-preset.js`；`harness-controller.js` 在 dshmarket 之后、ensure dshbot 之前调用。

## 不变量

- 同一 profile 一份插件；桌面副本赢过市场同名安装。  
- 预置失败不挡启动。  
- `dsh-home/profiles/web`，不是 `~/.dsh`（[dsh-home.md](dsh-home.md)）。

## 门槛

- QA：`TC-EXT-008`

## 延伸阅读

- [用量统计设计](../../superpowers/specs/2026-08-23-usage-stats-design.md)
