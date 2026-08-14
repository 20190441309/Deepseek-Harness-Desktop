# @deepseek-ai/dsh-client-ui-preview

[English](README.md) | 中文

右边栏 Browser occupant，挂在 `surfaces.browser`（`single`，`session-maybe`，由 ui-surfaces 声明）。仅桌面预览本地 URL 或应用。渲染进程拥有地址栏并上报宿主矩形；Electron 通过 `window.shell.preview*` 把 `BrowserView` 贴在该矩形上。约定：[slot 系统标准](../../../.agents/notes/implemented/architecture/2026-07-22-slot-type-chain-implementation.md)。

`previewOpen('http://127.0.0.1:*')` 会成功。非本地跳转会被拒绝。访客页使用隔离的 `dsh-preview` 分区，不携带用户 API key（与 harness web 相同：凭据请求不跟随重定向）。非 Electron 时，空态卡和本面板显示 `Browser previews are only available in the desktop app.`

`/client` 导出表层只包含插件主体（`apply`／`inject`）及约定类型；PreviewPanel 仍由 slot 注册封装在包内。

## 模型体验

无。Browser 面板只预览本地 URL；这里没有任何内容进入模型请求。

#### KV Cache 影响

无；该包（package）既不组装也不发送提供方请求。

## 已知限制与暂缓事项

- **同一时间只有一个访客页**：surfaces store 只持有一个 preview；occupant 内没有标签条。
- **没有发现端口的选择器**：用户自己输入回环 URL；面板不扫描本机服务。
