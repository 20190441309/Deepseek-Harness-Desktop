# @deepseek-ai/dsh-client-ui-user-terminal

[English](README.md) | 中文

用户终端：对话列底栏（`shell.terminalDrawer`）与右边栏 Terminal surface（`surfaces.terminal`）各自坐在独立的 `createTerminalSessionStore()` handle 上，因此在一侧打开的窗格不会出现在另一侧。约定：[slot 系统标准](../../../.agents/notes/implemented/architecture/2026-07-22-slot-type-chain-implementation.md)。

store 保存 `sessions[]`、`activeId`、每会话的 `cols`／`rows`／`buffer`，以及分屏组，上限为 `MAX_TERMINALS_PER_GROUP`（4）。桌面 PTY IPC 只挂在 `window.shell`（`ptyCreate`／`ptyWrite`／`ptyResize`／`ptyKill`／`onPtyData`／`onPtyExit`）；渲染进程不加载 Node。没有项目 cwd 时不创建 PTY。每个窗格是 `@xterm/xterm` 加 FitAddon。FitAddon 只在宿主已有 CSS 盒子后运行（rAF、30 ms settle、`ResizeObserver`、以及 `document.fonts` 的 `loadingdone`），再把 `ptyResize` 防抖 150 ms，避免分屏布局把 ConPTY 缩成 1×2 后 PowerShell 才打印提示符。活动窗格会获得焦点；在窗格上 pointerdown 会激活它，但不会把 DOM 焦点移到铬上。画布主题从宿主上的 `--dsw-*` 别名读取，画布字体来自 `--dsw-font-family-terminal`（否则 `--ds-font-family-code`）。Windows 上 PTY 启动 `powershell.exe -NoLogo -NoProfile`。

底栏工具条为左右分屏／上下分屏／最大化（还原记住上次高度）／新建／关闭。超过一个 PTY 时显示会话列表。选区提供复制、加入对话（terminal 围栏写入输入框；没有 session id 时禁用），以及在文本是 URL 或工作区路径时打开。⌘／Ctrl-点击激活同样的目标。loopback http(s) 打开 Browser，其它 http(s) 调用 `window.shell.openExternal`。工作区路径走 `workspaces.openPath`，并丢掉 `:line:column`。高度拖动写入 `setTerminalDrawer`，夹在 `TERMINAL_DRAWER_MIN` ..= 视口 75%。有 cwd 时 Ctrl+` 调用 `toggleTerminalDrawer`。本包 `inject` `surfaces.terminal`，等右边栏壳声明该槽后再挂上；该 occupant 没有单独最大化。

`/client` 导出表层只包含插件主体（`apply`／`inject`）、store 工厂及约定类型；抽屉与 surface 组件仍由 slot 注册封装在包内。

## 模型体验

无。用户终端只驱动桌面 PTY IPC 与布局几何；这里没有任何内容进入模型请求。

#### KV Cache 影响

无；该包（package）既不组装也不发送提供方请求。

## 已知限制与暂缓事项

- **右边栏壳不由本包拥有**：本包注入 `surfaces.terminal`，不声明 surfaces 列或其空态卡片。
- **最大化只属于会话底栏抽屉**：`surfaces.terminal` 没有单独的最大化控件。
- **没有跳行**：终端文件链接会丢掉 `:line:column`，因为 FilePreview 没有 revealLine。
