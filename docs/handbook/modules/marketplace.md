# 模块：插件市场

## 职责与非目标

**职责：** 内置 `dshmarket` 作为设置 section `market`；目录浏览、按 catalog id 安装/卸载。  
**非目标：** 独立 Electron 市场窗；Composer 草稿安装旧路径。

## 用户路径

见 [../flows/marketplace-install.md](../flows/marketplace-install.md)。Harness 未就绪时不应空开市场窗硬装。

## 架构要点

- 预置：`dshmarket-preset.js` + `vendor/dshmarket`。  
- 目录 / 安装：`marketplace-catalog.js`、`marketplace-install.js`、`marketplace-spec.js`、`marketplace-allowbuilds.js`。  
- Feature card：[../../features/marketplace-settings.md](../../features/marketplace-settings.md)

## 实现入口

- 上列 `src/main/marketplace-*.js`、`desktop-install-control.js`、`src/host/install-dsh-plugin-client.js`

## 不变量

- 无独立市场窗口（`TC-EXT-002`）。  
- 安装失败要可见失败反馈，不静默。
- `dsh plugin --profile web` 打进 `userData/dsh-home/profiles/web`，不是官方 `~/.dsh`（[dsh-home.md](dsh-home.md)）。

## 门槛

- QA：`TC-EXT-001` … `TC-EXT-005`

## 延伸阅读

- [../superpowers/specs/2026-08-18-marketplace-parity-design.md](../../superpowers/specs/2026-08-18-marketplace-parity-design.md)
