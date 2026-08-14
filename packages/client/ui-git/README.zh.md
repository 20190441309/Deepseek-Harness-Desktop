# @deepseek-ai/dsh-client-ui-git

[English](README.md) | 中文

标题栏尾簇插件：一枚 Session log 语汇的分裂按钮，通过桌面 `window.shell` git IPC 提交、推送并打开变更请求。条目挂在 `shell.titlebar.trailing`，`id: 'git-actions'`，`order: 20`，位于 Session log（`order: 10`）与面板开关（`order: 40`）之间。约定：[slot 系统标准](../../../.agents/notes/implemented/architecture/2026-07-22-slot-type-chain-implementation.md)。

主按钮文案跟随 `resolveQuickAction`。下拉三项为 Commit、Push 与 Create change request（GitHub 用语为 Pull request / PR；GitLab 为 MR）。当前会话没有 `cwd`，或 `gitStatus` 为 null 时，主按钮 disabled，并提示 `Git status is unavailable.`。默认分支上的 push / commit_push 先弹出 `resolveDefaultBranchActionDialogCopy` 再执行。

`GitActionsProps` 组合标题栏尾簇 owner share、用于当前会话 cwd 的 `useSessions`、注入的 git IPC 回调，以及 `git` 文案 seat。这里没有插件 store。桌面方法只挂在 `window.shell` 上；渲染进程不加载 Node。

`/client` 导出表层只包含插件主体（`apply`／`inject`）及约定类型；GitActionsControl 仍由 slot 注册封装在包内。

## 模型体验

无。标题栏 Git 控件只驱动桌面 git IPC；这里没有任何内容进入模型请求。

#### KV Cache 影响

无；该包（package）既不组装也不发送提供方请求。

## 已知限制与暂缓事项

- **未接入发布仓库**：没有 origin 时 `resolveQuickAction` 可能返回 `open_publish`；主按钮保持 disabled 并提示 `publish.unavailable`，本包不打开发布向导。
- **提交说明不自动生成**：提交弹窗留空时使用回退文案 `Update`，而不是模型撰写的主题。
