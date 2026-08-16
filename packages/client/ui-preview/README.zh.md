# @deepseek-ai/dsh-client-ui-preview

[English](README.md) | 中文

右边栏 Browser occupant，挂在 `surfaces.browser`（`single`，`session-maybe`，由 ui-surfaces 声明）。仅桌面预览本地 URL 或应用。渲染进程拥有地址栏并上报宿主矩形；Electron 通过 `window.shell.preview*` 把 `BrowserView` 贴在该矩形上。约定：[slot 系统标准](../../../.agents/notes/implemented/architecture/2026-07-22-slot-type-chain-implementation.md)。

`previewOpen('http://127.0.0.1:*')` 会成功。非本地文档导航会被拒绝。远程 CDN 的子资源（字体、脚本、图片）允许加载，以便本地 Vite/Next 应用能渲染；顶层与 iframe 导航仍限制在 loopback。访客页使用隔离的 `dsh-preview` 分区，不携带用户 API key（与 harness web 相同：凭据请求不跟随重定向）。非 Electron 时，空态卡和本面板显示 `Browser previews are only available in the desktop app.` occupant 挂载期间持续列出发现的 loopback 端口；点击芯片会打开或导航访客页。系统浏览器按钮在访客页尚未打开时也可使用地址栏 URL。guest 的 `did-navigate`／`did-navigate-in-page` 发出 `shell:preview-state-change`，地址栏和前进／后退跟随页内导航。非活动 surface Tab 会保留 guest（`previewHide`）；关闭浏览器 Tab 卸载面板并调用 `previewClose`。

`/client` 导出表层只包含插件主体（`apply`／`inject`）及约定类型；PreviewPanel 仍由 slot 注册封装在包内。

## 模型体验

无。Browser 面板只预览本地 URL；这里没有任何内容进入模型请求。

#### KV Cache 影响

无；该包（package）既不组装也不发送提供方请求。

## 已知限制与暂缓事项

- **同一时间只有一个访客页**：surfaces store 只持有一个 preview；occupant 内没有标签条。
- **没有设备、画中画或录制工具栏**：T3 这些预览铬在本桌面没有对等会话元数据。
