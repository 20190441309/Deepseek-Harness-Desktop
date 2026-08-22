# 模块：插件启动恢复

## 职责与非目标

**职责：** 用户插件弄挂时的跳过 / 重试 / 日志；与 boot 故障 UI 协作。  
**非目标：** 不自动静默删除用户插件；不伪造「已满配」状态。

## 用户路径

见 [../flows/plugin-recovery.md](../flows/plugin-recovery.md)。

## 架构要点

- 失败分类与跳过：`plugin-tree-failure.js`、`plugin-recovery-actions.js`。  
- Controller 持有 recovery 模式；boot-recovery 渲染动作。

## 实现入口

- `harness-controller.js`、`plugin-tree-failure.js`、`plugin-recovery-actions.js`
- `src/renderer/boot-recovery.js`
- Preload：`retryFullPlugins`、`saveBootLog`、`restart`

## 不变量

- 跳过与重试路径必须可测、可导出日志。  
- 造障类 QA 不得静默标 Pass。
- 官方 `~/.dsh` 隔离（[dsh-home.md](dsh-home.md)）不能代替跳过**桌面** `dsh-home` 里的用户插件。

## 门槛

- QA：`TC-INST-004` … `TC-INST-007`

## 延伸阅读

- [../superpowers/specs/2026-08-18-plugin-startup-recovery-design.md](../../superpowers/specs/2026-08-18-plugin-startup-recovery-design.md)
- [boot-lifecycle.md](boot-lifecycle.md)
