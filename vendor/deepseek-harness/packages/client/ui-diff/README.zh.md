# @deepseek-ai/dsh-client-ui-diff

[English](README.md) | 中文

右边栏 Diff occupant，挂在 `surfaces.diff`（`single`，`session-maybe`，由 ui-surfaces 声明）。展示工作区变更列表和统一 diff hunk，数据来自桌面 `window.shell.gitDiff(cwd)`。`gitStatus(cwd)` 为 null 时显示 T3code 理由：`Diff is only available for server threads in Git repositories.` 约定：[slot 系统标准](../../../.agents/notes/implemented/architecture/2026-07-22-slot-type-chain-implementation.md)。

工作区根是当前会话的 `cwd`，只通过一次 `useSessions` 读取。渲染进程不加载 Node。

`/client` 导出表层只包含插件主体（`apply`／`inject`）及约定类型；DiffPanel 仍由 slot 注册封装在包内。

## 模型体验

无。Diff 面板只为展示读取 git；这里没有任何内容进入模型请求。

#### KV Cache 影响

无；该包（package）既不组装也不发送提供方请求。

## 已知限制与暂缓事项

- **只看工作区**：没有 turn diff、分支基线选择，也没有左右分栏。
- **hunk 是堆叠的统一文本**：没有折行开关，也不忽略空白。
