# @deepseek-ai/dsh-client-ui-files

[English](README.md) | 中文

右边栏 Files occupant：在 `surfaces.files` 上展示只读工作区树，在 `surfaces.file` 上展示单文件预览。两个槽位都是 `single` + `session-maybe`，由 ui-surfaces 声明。点击文件会调用 owner 的 `openFile(relativePath)`。约定：[slot 系统标准](../../../.agents/notes/implemented/architecture/2026-07-22-slot-type-chain-implementation.md)。

工作区根是当前会话的 `cwd`，只通过一次 `useSessions` 读取。目录与文件字节来自桌面 `window.shell` 的 `listDir`／`readFile`／`readFileMedia`／`writeFile`；渲染进程不加载 Node。目录按需展开，树顶可以按文件名搜索（搜索深度上限 8、目录数上限 200；触达上限时面板会提示搜索已提前停止）。刷新会重载根目录；搜索进行中时会重新走搜索，不会丢掉嵌套匹配。提及是行内 `@` 写入输入框，没有 session id 时不展示；右键复制相对或绝对路径。图片以 data URL 渲染；未截断的文本可编辑保存；保存失败时编辑器和未保存缓冲区仍在，错误显示在上方。Tab 变为活动时 FilePreview 会重读磁盘。脏草稿在重读失败、返回截断或二进制、或当时没有 cwd 时仍留在编辑器（含 Markdown 源码）；只要有 cwd 就可以保存，写入成功后清除截断／二进制标记。保存会先重读；若磁盘相对基线和草稿都已变化，则保留草稿并显示 `error.changed`，再次保存才覆盖。surfaces 壳把未保存草稿写入 localStorage，刷新或退出后再打开仍能恢复。`.md` 可在源码与 `MarkdownText` 之间切换。

`/client` 导出表层只包含插件主体（`apply`／`inject`）及约定类型；FilesPanel、FilePreview 与 FileTree 仍由 slot 注册封装在包内。

## 模型体验

无。Files 面板只为展示读取工作区；这里没有任何内容进入模型请求。

#### KV Cache 影响

无；该包（package）既不组装也不发送提供方请求。

## 已知限制与暂缓事项

- **树不改工作区结构**：没有新建、重命名、删除。提及是有 session id 时行内 `@` 写入输入框，不能从树拖进输入框。未超出读取上限的文本可以编辑并保存。
- **没有跳行**：FilePreview 打开文件；终端带来的 `:line:column` 会被丢掉。
