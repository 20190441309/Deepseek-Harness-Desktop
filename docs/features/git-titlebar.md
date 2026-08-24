# Feature: Git titlebar

| Field | Value |
| --- | --- |
| **id** | `git-titlebar` |
| **status** | `active` |
| **last verified** | 2026-08-24 — 登记信任根新增高危祖先过滤（用户主目录 / APPDATA / userData / dsh-home）；兄弟项目场景不变 |

## User paths

1. 标题栏看当前分支 → 打开「选择分支」→ 搜索 / 切换 / 创建并检出。
2. Commit / Push / Pull / 变更请求（有远程且配置允许时）。
3. 已打开的工作区是 Git 仓库时，分支列表来自该仓库，不因启动目录不是其父目录而变空。

## Invariants

- 会话 cwd 只要是桌面 `dsh-home` 已登记的工作区目录（或启动工作区及其子目录），Git IPC 就对该路径生效。
- 登记路径可以是启动工作区的**兄弟目录**（例如 `Documents\Deepseek-Harness-Desktop` 启动、`C:\Ai\ChisaTerminal` 为当前项目）。
- `workspace.json` 里的盘符根（`C:\`、`/`）不得进入 Git/FS/PTY 白名单。
- 高危祖先也不得成为登记信任根：用户主目录、`%APPDATA%` / `Application Support` / `~/.config` / `~/.ssh`、desktop `userData` 与 `dsh-home` 根（等于这些目录、或包含它们的目录一律拒绝）。普通项目目录（含 Documents 下兄弟仓）不受影响。
- 非仓库降级（初始化 Git），不把授权失败画成「没有匹配的分支」。
- 官方 `dsh web` 标题栏 Git 视觉；不另做皮肤。

## Allowed touch

- `src/main/git.js`、`git-*.js` 与其单测
- `src/main/workspace-authority.js`（Git cwd 授权）
- Preload / `ipc.js` 的 `shell:git-*`
- 本卡与 handbook `modules/git-titlebar.md`

## Do not touch

- vendor `ui-git` 文案/菜单（空列表是 IPC 失败，不是缺文案）
- 官方 `~/.dsh`
- Appearance 图源、底栏终端契约（除非一并 Touching）

## Gates

| Kind | What |
| --- | --- |
| Automated | `src/main/git.test.js`；`workspace-authority.test.js`；`qa:packaged` 可 rehearsal 兄弟仓 `gitBranchList`（**不能**当发版 Pass） |
| Manual / QA | 每次发布前生产表 `TC-WS-006`、`TC-GIT-001`…`007`；已装 CI 包 + 真实 `dsh-home` |

## Sources

- Handbook：[../handbook/modules/git-titlebar.md](../handbook/modules/git-titlebar.md)
- Spec：[../superpowers/specs/2026-08-18-t3-git-tool-verbatim-leftovers-design.md](../superpowers/specs/2026-08-18-t3-git-tool-verbatim-leftovers-design.md)
