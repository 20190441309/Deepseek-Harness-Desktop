# Feature: Git titlebar

| Field | Value |
| --- | --- |
| **id** | `git-titlebar` |
| **status** | `active` |
| **last verified** | 2026-08-25 — 生产审查批次：远端行 `checkout --track` 建跟踪分支；`shell:git-*` handler 异常兜底为失败载荷（`git-ipc-guard.js`）；ui-git 侧 reject→失败 toast、分支列表失败画错误行、默认分支确认接线 `confirm.*` 字典、删除死代码 GitErrorDialog |

## User paths

1. 标题栏看当前分支 → 打开「选择分支」→ 搜索 / 切换 / 创建并检出。
2. Commit / Push / Pull / 变更请求（有远程且配置允许时）。
3. 已打开的工作区是 Git 仓库时，分支列表来自该仓库，不因启动目录不是其父目录而变空。

## Invariants

- 会话 cwd 只要是桌面 `dsh-home` 已登记的工作区目录（或启动工作区及其子目录），Git IPC 就对该路径生效。
- 登记路径可以是启动工作区的**兄弟目录**（例如 `Documents\Deepseek-Harness-Desktop` 启动、`C:\Ai\ChisaTerminal` 为当前项目）。
- `workspace.json` 里的盘符根（`C:\`、`/`）不得进入 Git/FS/PTY 白名单。
- 高危祖先也不得成为登记信任根：用户主目录、`%APPDATA%` / `Application Support` / `~/.config` / `~/.ssh`、desktop `userData` 与 `dsh-home` 根（等于这些目录、或包含它们的目录一律拒绝）。普通项目目录（含 Documents 下兄弟仓）不受影响。
- 非仓库降级（初始化 Git），不把授权失败画成「没有匹配的分支」；分支列表 IPC 失败在菜单内画「分支列表加载失败。」加详情行，不落空态。
- 分支菜单选无本地同名的远端行（`origin/feature-x`）时 `checkout --track` 建本地跟踪分支，不允许 detached HEAD。
- `shell:git-*` handler 异常必须 resolve 为该通道的失败载荷（状态/diff 类 → `null`，其余 → `{ok:false,message}`），不得让 renderer 的 invoke reject；授权检查仍在兜底之外照常 reject。进度 toast 不允许永久 loading。
- 已知权衡（信任粒度）：通过过滤的登记根对 Git/FS/PTY 全量生效，不做逐操作确认；边界是「登记只来自用户主动打开的工作区」加上盘符根与高危祖先过滤。
- 官方 `dsh web` 标题栏 Git 视觉；不另做皮肤。

## Allowed touch

- `src/main/git.js`、`git-*.js` 与其单测
- `src/main/workspace-authority.js`（Git cwd 授权）
- Preload / `ipc.js` 的 `shell:git-*`
- 本卡与 handbook `modules/git-titlebar.md`

## Do not touch

- vendor `ui-git` 文案/菜单默认不动（列表失败已在菜单内画错误行；2026-08-25 审查批次按任务指示做过一次最小 vendor 修复，后续改动仍需明示超出范围）
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
