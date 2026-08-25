# 模块：插件市场

## 职责与非目标

**职责：** 桌面自有市场：设置 section `market`（`ui-settings-market` 桌面 fork 包）+ 主进程精选目录 / 安装引擎；目录浏览、搜索、按 catalog id 安装 / 卸载。
**非目标：** 独立 Electron 市场窗；Composer 草稿安装旧路径；预置第三方 `dshmarket` 插件（已废止，见下）。

## 用户路径

见 [../flows/marketplace-install.md](../flows/marketplace-install.md)。Harness 未就绪时不应空开市场窗硬装。

## 架构要点

- UI：`vendor/deepseek-harness/packages/client/ui-settings-market`（桌面 fork 包，登记于
  `src/shared/harness-desktop-forks.js`），仅当 `window.shell` 暴露市场 API 时注册
  `settings.section` id `market`；纯 `dsh web` 浏览器无此分区。
- 目录 / 安装：`marketplace-catalog.js`、`marketplace-install.js`、`marketplace-spec.js`、`marketplace-allowbuilds.js`。
- 与上游分离：`dshmarket` 在 `DROPPED`（不挂载、目录隐藏、拒绝安装）；
  `dshmarket-preset.js` 只剩 `removeDshMarketPreset` 清理旧预置残留；
  `vendor/dshmarket` 只剩 attribution stub（LICENSE + `DESKTOP-FORK.md`），源码快照已删。
  上游主题商店 / 备份 / 诊断等能力是 v1 明确不移植的产品裁剪（见 feature card Deferred）。
- Feature card：[../../features/marketplace-settings.md](../../features/marketplace-settings.md)

## 实现入口

- Main：上列 `src/main/marketplace-*.js`、`dshmarket-preset.js`、`desktop-install-control.js`
- Host：`src/host/install-dsh-plugin-client.js`
- Client：`vendor/deepseek-harness/packages/client/ui-settings-market/src/client/`

## 不变量

- 无独立市场窗口（`TC-EXT-002`）。
- 只有一个 `market` 分区：桌面自有 section 注册它，`DROPPED` 保证旧 dshmarket 不再挂载。
- 安装失败要可见失败反馈，不静默；`needsAllowBuilds` 走内联确认后重试。
- `dsh plugin --profile web` 打进 `userData/dsh-home/profiles/web`，不是官方 `~/.dsh`（[dsh-home.md](dsh-home.md)）。
- 重启归 HarnessController（`restartAfterProfileWrite`）。

## 门槛

- QA：`TC-EXT-001` … `TC-EXT-005`

## 延伸阅读

- [../../superpowers/specs/2026-08-25-marketplace-desktop-integration.md](../../superpowers/specs/2026-08-25-marketplace-desktop-integration.md)
- [../../superpowers/specs/2026-08-18-marketplace-parity-design.md](../../superpowers/specs/2026-08-18-marketplace-parity-design.md)
