# Feature: Session archive

| Field | Value |
| --- | --- |
| **id** | `session-archive` |
| **status** | `active` |
| **last verified** | 2026-08-23 — C1d docs + TC-CHAT-010 |

## User paths

1. 活会话行 ⋯ → 归档会话：行从项目/任务/平铺/搜索消失，日志与工作区 `sessionIds` 槽位保留。
2. 侧栏底部 **已归档**：点行 = 取消归档并打开；⋯ → 取消归档。
3. 已归档 ⋯ → 删除会话（C2）：确认后永久删除该会话日志；工作区文件夹不动。

## Invariants

- 活会话菜单只有归档，没有删除。
- 恢复与销毁只出现在「已归档」。
- 打开已归档行必须先取消归档；不得以归档态停留在主视图。
- 桌面不另做会话浏览器；走官方 `ui-workspace`。
- 删除只接受已归档的请求根；子 agent（`origin === 'subagent'`）随根删除；fork 不随根删除。

## Allowed touch

- `vendor/deepseek-harness/packages/workspace/workspace/`
- `vendor/deepseek-harness/packages/host/apiproxy/` workspace + sessions API
- `vendor/deepseek-harness/packages/client/runtime/` workspaces + sessions
- `vendor/deepseek-harness/packages/client/ui-workspace/`
- `vendor/deepseek-harness/packages/session/session-persistence*`（仅 C2）
- 本卡、QA TC-CHAT-010 / TC-CHAT-011

## Do not touch

- Appearance / 图库 / 市场
- 活会话行上的删除
- Electron / PTY `DSH_HOME`
- 附件 blob GC、message-feedback 级联

## Gates

| Kind | What |
| --- | --- |
| Automated | vendor workspace + apiproxy + `pnpm run test:gui`；可见 UI 另跑 `DSH_SNAPSHOT=replay pnpm run test:web` |
| Manual / QA | `TC-CHAT-010` 取消归档；`TC-CHAT-011` 硬删除（C2） |

## Sources

- Spec / plan: [2026-08-23-github-issues-17-18-19.md](../superpowers/plans/2026-08-23-github-issues-17-18-19.md)
- Agent Note: `vendor/deepseek-harness/.agents/notes/implemented/feature/2026-07-31-session-archive-global-set.md`
