# Feature: SettingsSelect primitive（停放）

| Field | Value |
| --- | --- |
| **id** | `settings-select` |
| **status** | `parked`（wip 停放于 dsh-v0.1.1-rc.1 之上，未发布） |
| **last verified** | 2026-08-22 — 合并审查补建本卡；静态复查 + vendor 单测文件存在（未在本机运行 vendor vitest） |

## User paths

1. 设置 → MCP → 添加/编辑服务器 → 编辑框「传输方式」下拉（stdio / HTTP）由 `SettingsSelect` 渲染（替代原生 `<select>`）。

## Invariants

- `SettingsSelect` 是 `ui-primitives` 公开原语（`variant="block"` 等），样式只用 `--dsw-alias-*` 与组件局部令牌，无字面颜色。
- 传输语义不变：仍只提供 stdio / streamable-http 二选一，`onChange` 的 id 映射与原 select 行为一致。
- 停放期间不新增使用点；扩展前先更新本卡并转 `active`。
- 存在性由 `src/shared/harness-desktop-forks.js` 的 `FORK_FILE_MARKERS` 钉住。

## Allowed touch

- `vendor/deepseek-harness/packages/client/ui-primitives/src/SettingsSelect.tsx` / `.module.css` / `index.ts` 导出与 `tests/settings-select.client.spec.tsx`
- `vendor/deepseek-harness/packages/client/ui-settings-mcp/src/client/McpSection.tsx` / `.module.css` 与 `tests/mcp-section.client.spec.tsx`（仅传输下拉接线）

## Do not touch

- 传输方式选项集合与语义；pending 态禁用行为
- 其他设置分区（Appearance / Models / Skills…）未经各自卡不动

## Gates

| Kind | What |
| --- | --- |
| Automated | vendor：`npx vitest run packages/client/ui-primitives/tests/settings-select.client.spec.tsx packages/client/ui-settings-mcp/tests/mcp-section.client.spec.tsx`。Desktop：`npm test`（fork 标记断言） |
| Manual / QA | none（停放态不挂实机用例） |

## Sources

- 承载提交：`ec86bdc7f6`（wip park）
- Handbook: [../handbook/appendix/settings-sections.md](../handbook/appendix/settings-sections.md)
- Registry: `src/shared/harness-desktop-forks.js` `FORK_FILE_MARKERS`
- Implementation: `packages/client/ui-primitives/src/SettingsSelect.tsx`、`packages/client/ui-settings-mcp/src/client/McpSection.tsx`
