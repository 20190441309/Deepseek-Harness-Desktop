# @deepseek-ai/dsh-client-ui-settings-mcp

[English](README.md) | 中文

Web Settings 栏目 `mcp`（order 18）。页面列出 `ctx.remote.mcpServers` 中的受管 MCP 服务器以及只读的组成配置行，并通过 `upsert` / `delete` / `setEnabled` 编辑受管文档。产品文案为中文；持久化由 Host Remote 负责。

## 模型体验

无，因为这个浏览器 Settings 页不注册提示词、工具、消息或提供方请求。

#### KV Cache 影响

无；本包从不组装模型输入。

## 已知限制与暂缓事项

- **没有连接探测按钮** — 行上只显示 Host 快照里的 fiber 阶段。
- **没有市场或 `.mcp.json` 导入** — 添加只是本地表单。
