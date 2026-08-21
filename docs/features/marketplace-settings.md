# Feature: Marketplace in Settings

| Field | Value |
| --- | --- |
| **id** | `marketplace-settings` |
| **status** | `active` |
| **last verified** | 2026-08-21 — card authored from marketplace parity spec + QA §10 |

## User paths

1. 设置 → 市场（`market`）：浏览目录、刷新。
2. 按 catalog id 安装 → 见进度 → 成功则已安装可见；失败有明确反馈。
3. 卸载插件后列表更新且应用仍可用。
4. 托盘 / 菜单「插件市场」进入设置市场分区，不出现独立 BrowserWindow。

## Invariants

- 市场是设置内 section，**无**独立 Electron 市场窗。
- 安装走桌面 IPC / catalog id，不往 Composer 塞安装草稿。
- Harness 未就绪时不以空市场窗硬装。
- 失败可见（Modal 或等价），不静默。

## Allowed touch

- `src/main/marketplace-*.js`、`dshmarket-preset.js`、`desktop-install-control.js`
- `src/host/install-dsh-plugin-client.js`
- `vendor/dshmarket/`（预置插件 UI）
- 相关桌面测试与本卡 / handbook 市场章

## Do not touch

- 恢复独立市场 BrowserWindow
- 无关邻域：壁纸、Surfaces、Models（除非用户扩大 Touching）

## Gates

| Kind | What |
| --- | --- |
| Automated | `src/main/marketplace-*.test.js`、`dshmarket-preset` 相关单测；`npm run qa:source` 市场分区存在性 |
| Manual / QA | `TC-EXT-001` … `TC-EXT-005`；`TC-DESK-002`（托盘进市场） |

## Sources

- Handbook：[../handbook/modules/marketplace.md](../handbook/modules/marketplace.md)、[../handbook/flows/marketplace-install.md](../handbook/flows/marketplace-install.md)
- Spec：[../superpowers/specs/2026-08-18-marketplace-parity-design.md](../superpowers/specs/2026-08-18-marketplace-parity-design.md)
