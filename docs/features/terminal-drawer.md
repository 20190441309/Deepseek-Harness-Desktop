# Feature: Terminal drawer

| Field | Value |
| --- | --- |
| **id** | `terminal-drawer` |
| **status** | `active` |
| **last verified** | 2026-08-25 — P1 修复：焦点在 Ghostty 终端内 `` Ctrl+` `` 可开关抽屉（`keybindings.ts` 钉 `[data-terminal-pane]`，`handleBeforeKey` 放行冒泡）；`.xterm` fixtures 清零。此前 2026-08-23 — B1 pin `copy-ghostty-assets.mjs`（d55468de11）；0.2.7 runtime 含 ghostty wasm + Nerd Font；`127.0.0.1:3080` 三 URL 均 200 |

## User paths

1. `` Ctrl+` `` 打开底栏终端；可输入命令。
2. 选区送进对话（Composer）。
3. 多会话 / 分屏（若 UI 提供）；销毁后可重建。

## Invariants

- 终端是工作环，不是空态说明卡片。
- PTY 由桌面 `pty.js` 提供；UI 为官方终端组件语言（等宽网格 / Ghostty）。
- `libghostty-vt` wasm 必须能从 `/plugins/<id>/assets/` 读到；源码启动会校验并把 wasm 拷到 `lib/assets`，缺则拒绝启动。
- 不做未承诺的 GPU 终端嵌入。

## Allowed touch

- `src/main/pty.js` 及 PTY 相关测试
- `src/main/dsh.js`、`src/shared/ghostty-assets.js` 及对应测试（源码启动 Ghostty 校验/拷贝）
- Harness `ui-user-terminal`（及桌面接线）
- Harness `ui-titlebar` 的 keybindings / PanelToggles（面板快捷键判定，2026-08-25 硬化计划扩围）
- 本卡与 handbook terminal 章

## Do not touch

- 用空态卡片墙替代可用 PTY
- 无用户授权时改 Surfaces Tab 关闭位置（属 `surfaces-work-loops`）

## Gates

| Kind | What |
| --- | --- |
| Automated | `pty.test.js` / `dsh.test.js` / `ghostty-assets.test.js`；`qa:packaged` 可 rehearsal 兄弟仓 PTY + wasm 200（**不能**当发版 Pass） |
| Manual / QA | 每次发布前生产表 `TC-TERM-001`…`004`、`TC-CHAT-004`；已装 CI 包、TC-WS-006 仓 |

## Sources

- Handbook：[../handbook/modules/terminal.md](../handbook/modules/terminal.md)
- Note：`vendor/deepseek-harness/.agents/notes/implemented/feature/2026-08-16-surfaces-terminal-work-loops.md`
- 审查与硬化计划：[../superpowers/plans/2026-08-25-surfaces-terminal-hardening.md](../superpowers/plans/2026-08-25-surfaces-terminal-hardening.md)
