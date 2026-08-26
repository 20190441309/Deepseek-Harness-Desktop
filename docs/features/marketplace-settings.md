# Feature: Marketplace in Settings

| Field | Value |
| --- | --- |
| **id** | `marketplace-settings` |
| **status** | `active` |
| **last verified** | 2026-08-26 — PR #46 评审跟进：未安装卡片的安装按钮与主进程白名单对齐（`deprecated` 或空 `installSpec` 不出安装入口）、页签补全 tab/tabpanel ARIA 关联（`market-tab-*` ↔ `market-panel-*`）、刷新按钮加 `title`、已安装匹配改为 `spec-match.ts` 的 owner/repo 整段边界匹配（`github:acme/demo-extra` 不再误配 `acme/demo`）。vendor `ui-settings-market` vitest 4 文件 37/37 绿（market-section.client.spec 24、spec-match.client.spec 8、browser-plugin 4、invariant 1），包目录 oxlint 干净。`qa:source` 在跟进提交后复跑全绿：73 PASS / 3 SKIP（均与市场无关）/ 0 FAIL，含 market.section / market.discover / market.installed PASS（Linux xvfb 源码运行，[结果](../qa/results/2026-08-26/market-follow-up-qa-source.md)）。同日早些时候：市场分区重排为「发现 / 已安装」双页签官方样式（`Pill` 页签、`Input` 搜索、头像 / 星标 / 分类 / 主页链接卡片、已安装按目录分类分组 + 未分组置底）。此前 2026-08-25（合并树 `ea659884`）：consolidation #39 后 desktop `npm test` 997/0/3 绿；Deferred 定为 v1 明确不移植；`vendor/dshmarket` 收缩为 attribution stub |

## User paths

1. 设置 → 市场（`market`，由桌面自有包 `ui-settings-market` 注册）：「发现」页浏览目录、搜索、分类过滤、刷新；卡片带作者头像、星标、分类标签、主页链接与已弃用徽标。
2. 按 catalog id 安装 → 见进度行 → 成功则卡片标「已安装」；失败有 `role="alert"` 反馈。
3. `needsAllowBuilds` 时出现内联确认（列出 allowBuilds key），允许后自动重试。
4. 「已安装」页签（标签带数量）按目录分类分组列出 profile 插件行（目录外归「未分组」），逐行卸载后列表更新且应用仍可用；空态指回「发现」页。
5. 托盘 / 菜单「插件市场」进入设置市场分区，不出现独立 BrowserWindow。

## Invariants

- **市场是桌面自有代码**：UI 是 `vendor/deepseek-harness/packages/client/ui-settings-market`
  （桌面 fork 包，登记于 `harness-desktop-forks.js`），引擎是主进程
  `marketplace-catalog.js` / `marketplace-install.js`。不再预置安装第三方 `dshmarket`
  插件；`vendor/dshmarket` 只剩 attribution stub（LICENSE + `DESKTOP-FORK.md` +
  marker `package.json`，源码快照已删），不打包、不自动装。
- `dshmarket` 在 `DROPPED` 名单：Loader 不挂载它（含用户旧装副本），保证只有一个
  `market` 分区；磁盘文件不删除。启动时 `removeDshMarketPreset` 只清理桌面预置残留
  （受管 patch 块、`desktop-plugins/dshmarket` 副本、预置 symlink）。
- 市场是设置内 section，**无**独立 Electron 市场窗。
- 安装走桌面 IPC / catalog id（`shell:install-marketplace-plugin`），不往 Composer 塞安装草稿。
- 未安装卡片只在可安装时提供「安装」按钮：`deprecated` 或空 `installSpec` 的行不出安装入口
  （与主进程安装白名单一致；已装行不受影响，仍显示「已安装」标记 + 卸载）。
- 已安装 ↔ 目录行的规格匹配走 `spec-match.ts` 的 owner/repo 整段边界匹配
  （`packageName` 精确匹配优先），不做子串 `includes`。
- 安装落点是桌面 `dsh-home/profiles/web`，不是官方 `~/.dsh`（见 [dsh-home](dsh-home.md)）。
- 重启归 HarnessController（`restartAfterProfileWrite` → `startHarness`），无游离 dshmarket 重启路径。
- Harness 未就绪时不以空市场窗硬装。
- 失败可见（`role="alert"` / 进度行），不静默；「已写入 profile 但 Harness 未起」也要提示。

## Deferred（v1 明确不移植 — 产品裁剪）

主题商店、备份 / Gist、诊断面板、插件热更新、多 registry 源管理、试用通道：
**won't port**，不是待办。桌面自有市场 v1 的范围就是精选目录浏览 / 搜索 / 安装 / 卸载。
`vendor/dshmarket` 的源码快照已删除（只剩 attribution stub）；若未来某项能力重新立项，
从上游仓库取参考、按 `ui-settings-market` 第一切片的模式新写 desktop fork 包 + 桌面 IPC，
先开新 feature card，不回退到预置插件。

## Allowed touch

- `src/main/marketplace-*.js`、`dshmarket-preset.js`（清理模块）、`desktop-install-control.js`、`plugins.js`（DROPPED 行）
- `src/host/install-dsh-plugin-client.js`
- `vendor/deepseek-harness/packages/client/ui-settings-market/`（桌面自有市场 UI）
- `src/shared/harness-desktop-forks.js`（登记行）与 web-app bundle 的注册三件套
- `vendor/dshmarket/`（attribution stub：LICENSE + DESKTOP-FORK.md + marker package.json；不得恢复源码快照或自动安装）
- 相关桌面测试与本卡 / handbook 市场章

## Do not touch

- 恢复独立市场 BrowserWindow
- 恢复 `ensureDshMarketPlugin` 预置安装或 extraResources 打包 dshmarket
- 无关邻域：壁纸、Surfaces、Models（除非用户扩大 Touching）

## Gates

| Kind | What |
| --- | --- |
| Automated | `src/main/marketplace-*.test.js`、`dshmarket-preset.test.js`（清理语义）、`harness-desktop-forks.test.js`（vendor 注册三件套）；vendor `ui-settings-market` client specs；`npm run qa:source` 市场分区存在性 |
| Manual / QA | `TC-EXT-001` … `TC-EXT-005`；`TC-DESK-002`（托盘进市场） |

## Sources

- Handbook：[../handbook/modules/marketplace.md](../handbook/modules/marketplace.md)、[../handbook/flows/marketplace-install.md](../handbook/flows/marketplace-install.md)
- Spec：[../superpowers/specs/2026-08-25-marketplace-desktop-integration.md](../superpowers/specs/2026-08-25-marketplace-desktop-integration.md)、[../superpowers/specs/2026-08-18-marketplace-parity-design.md](../superpowers/specs/2026-08-18-marketplace-parity-design.md)
- Agent note：`vendor/deepseek-harness/.agents/notes/implemented/feature/2026-08-25-desktop-owned-market-section.md`
