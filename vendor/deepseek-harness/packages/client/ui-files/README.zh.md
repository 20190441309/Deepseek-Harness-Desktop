# @deepseek-ai/dsh-client-ui-files

[English](README.md) | 中文

右边栏 Files occupant：在 `surfaces.files` 上展示只读工作区树，在 `surfaces.file` 上展示单文件预览。两个槽位都是 `single` + `session-maybe`，由 ui-surfaces 声明。点击文件会调用 owner 的 `openFile(relativePath)`（T3code `openFile`）。约定：[slot 系统标准](../../../.agents/notes/implemented/architecture/2026-07-22-slot-type-chain-implementation.md)。

工作区根是当前会话的 `cwd`，只通过一次 `useSessions` 读取。目录与文件字节来自桌面 `window.shell` 的 `listDir`／`readFile`；渲染进程不加载 Node。目录按需展开。

`/client` 导出表层只包含插件主体（`apply`／`inject`）及约定类型；FilesPanel、FilePreview 与 FileTree 仍由 slot 注册封装在包内。

## 模型体验

无。Files 面板只为展示读取工作区；这里没有任何内容进入模型请求。

#### KV Cache 影响

无；该包（package）既不组装也不发送提供方请求。

## 已知限制与暂缓事项

- **树是只读的**：没有新建、重命名、删除，也不能拖到输入框提及。
- **预览是纯文本**：二进制文件显示 `preview.binary`；没有图片或 Markdown 渲染模式。
