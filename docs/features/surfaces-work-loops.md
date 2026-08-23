# Feature: Surfaces work loops

| Field | Value |
| --- | --- |
| **id** | `surfaces-work-loops` |
| **status** | `active` |
| **last verified** | 2026-08-23 — Files 关闭在标题右侧；Browser 访客 `contextIsolation`；artifact 仅 `preview-recordings` |

## User paths

1. `Ctrl+\` 打开右栏 → Files 搜索 / 预览 / 送对话。
2. Browser：输入 URL、导航；可选截图 / PiP / 录制。
3. Diff / Agents 按当前 UI 可用。
4. Surface Tab 关闭控件在标题**右侧**。

## Invariants

- 右栏是**工作环**（搜、导航、选区进对话），不是空态功能卡片网格。
- 不做 note 标明的范围外能力：GPU 终端嵌入、worktree、turn-diff、review-comment pick（勿假装已有）。
- Tab 关闭在标题右侧，未经用户明确要求不挪到左侧。

## Allowed touch

- Harness surfaces 相关 client 包（如 `ui-files`、browser/preview 接线）
- `src/main/preview*.js`、`workspace-fs.js`（Files 供数）
- 本卡与 handbook surfaces 章

## Do not touch

- 把空态卡片墙当「做完」
- 挪动 Tab 关闭位置（除非用户明确要求）
- 底栏终端契约（见 `terminal-drawer`）除非一并 Touching

## Gates

| Kind | What |
| --- | --- |
| Automated | 相关 client / preview 单测；`npm run qa:source` |
| Manual / QA | `TC-SURF-001` … `TC-SURF-007`；`TC-CHAT-007`、`TC-CHAT-008` |

## Sources

- Handbook：[../handbook/modules/surfaces.md](../handbook/modules/surfaces.md)
- Note：`vendor/deepseek-harness/.agents/notes/implemented/feature/2026-08-16-surfaces-terminal-work-loops.md`
- AGENTS.md Surfaces 段
