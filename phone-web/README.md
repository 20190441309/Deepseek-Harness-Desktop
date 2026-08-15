# 手机 Web

独立竖屏页，不是官方桌面 UI 的窄屏版。扫码进入后自动打开最近一次有效对话；列表在左侧抽屉里。

- 配对密钥只在 `#offer=` 里，页面不会要求手输令牌。
- 顶栏按钮弹出 / 收回左侧抽屉：新对话、搜索、工作区 `+`、会话列表、底部设置。
- 长按会话：重命名、分叉会话、归档会话。
- 设置只含本机外观、语言和关于；模型密钥、插件市场和远程配对仍在桌面端。

```powershell
cd phone-web
npm install
npm test
npm run build
```

桌面端 `RemoteGateway` 把文档和静态资源指到 `phone-web/dist`，`/api` 与 WebSocket 仍转到本机 Host。Electron 窗口继续打开官方页。
