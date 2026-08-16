# @deepseek-ai/dsh-client-ui-user-terminal

[English](README.md) | 中文

共用用户终端：对话列底栏（`shell.terminalDrawer`）与右边栏 Terminal surface（`surfaces.terminal`）坐在同一个 `createTerminalSessionStore()` handle 上，因此任一壳的 `activate(id)` 读到同一条会话记录。约定：[slot 系统标准](../../../.agents/notes/implemented/architecture/2026-07-22-slot-type-chain-implementation.md)。

store 保存 `sessions[]`、`activeId`、每会话的 `cols`／`rows`／`buffer`，以及分屏组，上限为 T3code 的 `MAX_TERMINALS_PER_GROUP`（4）。桌面 PTY IPC 只挂在 `window.shell`（`ptyCreate`／`ptyWrite`／`ptyResize`／`ptyKill`／`onPtyData`／`onPtyExit`）；渲染进程不加载 Node。没有项目 cwd 时不创建 PTY。每个窗格是 `@xterm/xterm` 加 FitAddon；画布主题从宿主上的 `--dsw-*` 别名读取。Windows 上 PTY 启动 `powershell.exe -NoLogo -NoProfile`。

底栏工具条为分屏／最大化／新建／关闭。高度拖动写入 `setTerminalDrawer`，夹在 `TERMINAL_DRAWER_MIN` ..= 视口 75%。有 cwd 时 Ctrl+` 调用 `toggleTerminalDrawer`。本包 `inject` `surfaces.terminal`，等右边栏壳声明该槽后再挂上。

`/client` 导出表层只包含插件主体（`apply`／`inject`）、store 工厂及约定类型；抽屉与 surface 组件仍由 slot 注册封装在包内。

## 模型体验

无。用户终端只驱动桌面 PTY IPC 与布局几何；这里没有任何内容进入模型请求。

#### KV Cache 影响

无；该包（package）既不组装也不发送提供方请求。

## 已知限制与暂缓事项

- **右边栏壳不由本包拥有**：本包注入 `surfaces.terminal`，不声明 surfaces 列或其空态卡片。
