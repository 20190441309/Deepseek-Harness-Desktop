# Agent Note: 桌面插件市场精选目录

Status: implemented

[English](2026-08-18-desktop-marketplace-curated-catalog.md) | 中文

## 问题

桌面插件市场用第二个 Electron 窗口列出 GitHub `topic:dsh-plugin` 搜索结果，再把 Host `install_dsh_plugin` 预填进输入框。那次搜索不是 awesome-dsh-plugin 登记表。Host 的 `installPlugin` 只接受 `github:owner/repo[#ref]`，精选目录里的 monorepo `#path:` 行无法走该通道。预装 `dshmarket` 会再带一套 Settings UI 和 `/dsh-market/*` HTTP 路由，且不用 `ui-primitives`。

## 决策

**唯一界面是设置标签页 `settings.plugins.tab`（id `marketplace`）。** 托盘和菜单的 `openMarketplace()` 显示主窗口，并跳到设置 → 插件 → 插件市场。Harness 未加载时，该调用记下待跳转并只显示主窗口，绝不创建市场 `BrowserWindow`。该标签页使用 `ui-primitives`（`Input` / `Button` / `Menu` / `Modal`）和 `--dsw-alias-*`。确认 Modal 原样展示目录 `installSpec`，再调用 `installMarketplacePlugin(id)`。没有 GitHub Token 输入。

**目录是 `https://awesome-dsh-plugin.com/plugins.json`。** 主进程拉取（测试用 `DSHD_MARKETPLACE_REGISTRY_URL`）。超时 4 秒。成功响应必须是带非空 `plugins` 数组的对象。`listMarketplace({ refresh?, locale? })` 的 `locale` 为 `zh` | `en`（默认 `zh`；`zh*` 映射为 `zh`）。磁盘缓存在 `app.getPath('userData')`，`CACHE_VERSION` 为 3，TTL 1 小时。回退顺序是内存、磁盘、打包快照 `src/main/marketplace-registry-snapshot.json`。`source` 为 `live` | `cache` | `snapshot`；非 live 必须带 `warning`。每一层都空时返回 `ok: false`、`items: []` 和可见警告。不搜 GitHub topic。

`installSpec` 是目录 `install` 命令的最后一个空白分词。目录 `id` 是 `owner/name`（name 可含 `#`）。

**安装路径分开。** `installMarketplacePlugin(id)` 在当前目录（内存，否则磁盘，否则快照）按该 id 查出这一行。只有该行的 `installSpec` 能进 `dsh plugin --profile web add`。允许的规格：通过 `isValidPackageName` 的目录 npm 包名；通过 `isValidGithubSpec` 且与该行 GitHub URL 一致的 `github:owner/repo` 或 `github:owner/repo#<gitRef>`；`github:owner/repo#path:/<posix>`，其中 posix 路径不含 `..`、`:`、反斜杠，且 owner/repo 与该行 URL 一致（`isValidMarketplacePathSpec`）。进 CLI 之前拒绝：`file:`、`link:`、tarball 或 git URL、未知 id、`DROPPED` 包、非法 `allowBuilds`。桌面其它功能已存的 GitHub Token 可用来钉 SHA；没有 Token 就装浮动 ref。

`installPlugin(spec)` 仍只接受 github（`isValidGithubSpec`），给 Host 的 `install_dsh_plugin` 控制通道用。设置页不调用它。

安装与卸载共用一把进行中互斥锁。add 成功但没有可加载的 dsh 入口：当场卸掉并报失败。`ok: false` 时不调用 `startHarness()`。`needsAllowBuilds` 再确认一次，然后带名单重试一次。渲染层只传目录 id。

截图画廊、页内主题页、检查更新、热禁用、备份和诊断不在本决策里。

## 曾考虑的替代方案

**预装或 vendor `dshmarket`（dsh-market 1.12.1）。** 否决：该插件自带 `MarketSection` 和 `/dsh-market/*` HTTP 路由。产品面是现有设置标签页，只用 `ui-primitives` 和 `--dsw-alias-*`。目录拉取和安装白名单不必安装该包就能对齐。

**保留第二个 Electron 市场窗口（`src/renderer/marketplace/`）。** 否决：第二份 `file:` 文档需要平行色板、市场 IPC 角色，以及钉在 `marketplace/index.html` 上的导航守卫。托盘和菜单的 `openMarketplace()` 打开设置页。

**用 `isValidGithubSpec` 校验 `#path:` 规格。** 否决：Host 的 `installPlugin` 必须保持只接受 `github:owner/repo[#ref]`。`#path:` 是市场目录 token。放宽 `isValidGithubSpec` 会让 Host 控制通道接受 monorepo 路径。市场路径规格走 `isValidMarketplacePathSpec`。

## 后果

没有独立市场窗口，没有 `IPC_ROLES.MARKETPLACE`，也没有 `shell:seed-install-draft`。特权导航只把 boot 的 `file:` 钉在打包的 `boot.html`。设置页市场安装走目录 id。Host 的 `install_dsh_plugin` 仍只接受 github。离线目录用缓存再快照，不搜 GitHub。

## 测试

`src/main/marketplace-catalog.test.js` 钉住语言映射、npm／github／`#path:` token、`DROPPED` 过滤，以及 live → cache → snapshot 回退。`src/main/marketplace-install.test.js` 钉住 `installMarketplacePlugin(id)` 查找、未知 id、`DROPPED`、非法 `allowBuilds`、目录 `#path:` 允许而 `installPlugin` 拒绝、路径含 `..`／反斜杠拒绝、安装卸载互斥锁，以及无入口回滚。`src/main/window-marketplace.test.js` 钉住 `openMarketplace` 不加载 `marketplace/index.html` 窗口。`src/main/ipc-authorization.test.js` 钉住没有 `MARKETPLACE` 角色。`src/main/local-url.test.js` 钉住不存在 `isMarketplaceNavigationUrl`。`ui-settings-plugin-inventory` 钉住列表与筛选、Modal 确认 `installSpec`、`installMarketplacePlugin(id)`、卸载确认、无 Token 栏，以及可关闭的抛错安装失败。

## 相关

- [右边栏与终端工作环](2026-08-16-surfaces-terminal-work-loops.md)
- [Host install_dsh_plugin 控制通道](2026-08-15-marketplace-draft-install.md)
