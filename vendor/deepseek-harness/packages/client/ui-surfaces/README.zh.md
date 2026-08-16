# @deepseek-ai/dsh-client-ui-surfaces

[English](README.md) | 中文

右边栏壳：占用布局 `surfaces` 列（`single`，`session-maybe`），在没有 surface 时展示 2×N 空态卡片（浏览器 / 终端 / 文件 / 差异 / 代理）。点卡片会调用 `createSurfacesStore()` 的 `open(kind)` 以及 `layout.openSurfaces()`。已有 surface 时渲染标签条和当前 occupant。约定：[slot 系统标准](../../../.agents/notes/implemented/architecture/2026-07-22-slot-type-chain-implementation.md)。

store 用 `sessionId` 做 key（`bySession`）。`open` 会 upsert 单例的 files／diff／agents、一个 preview、以及一个 terminal 占位。`openFile` 保留 files 资源管理器并并列加上 `file:` Tab。`activate`／`close`／`closeOthers`／`closeToRight`／`closeAll` 只改该会话的列表。标题栏 `toggleSurfaces` 只写布局宽度，不清这个 store。桌面在存在 `listDir` 且路径位于会话 cwd 内时，把 `workspaces.openPath` 接到 `openFile`。

声明的子座都是 `single` + `session-maybe`：`surfaces.browser`、`surfaces.terminal`、`surfaces.files`、`surfaces.file`、`surfaces.diff`、`surfaces.agents`。`surfaces.terminal` 与 ui-user-terminal 的 inject 一致，现有 Terminal occupant 才能挂上。`surfaces.files` 的 owner 是 `openFile(relativePath)`；`surfaces.file` 的 owner 是 `relativePath`。当前会话没有 cwd 时禁用差异空态卡。DiffPanel 在 cwd 不是 Git 仓库时自行展示 T3code 的不可用文案。没有桌面 `window.shell.previewOpen` 时禁用浏览器卡，理由与 T3code 相同：`Browser previews are only available in the desktop app.` occupant 内容由后续包注入。

`/client` 导出表层只包含插件主体（`apply`／`inject`）、store 工厂及约定类型；SurfacesRoot、EmptyState 与 SurfaceTabs 仍由 slot 注册封装在包内。

## 模型体验

无。右边栏壳只拥有查看状态与布局列几何；这里没有任何内容进入模型请求。

#### KV Cache 影响

无；该包（package）既不组装也不发送提供方请求。

## 已知限制与暂缓事项

- **occupant 不在本包实现**：Files、Diff、Browser、Agents 卡片只调用 `open(kind)` 与 `openSurfaces()`；后续包注入槽位内容。
- **文件预览仍只读**：`writeFile` 和页内编辑仍暂缓。
