# @deepseek-ai/dsh-client-ui-settings-mcp

[English](README.md) | 中文

Web Settings 栏目 `mcp`（order 18）。页面把 `ctx.remote.mcpServers` 中的受管 MCP 服务器与只读组成配置行呈现为可搜索目录，带一个启用筛选和发丝行。Host fiber 阶段与配置启用状态分离。可写行使用 Switch 以及编辑/删除图标动作。未连接的已启用 HTTP 行显示「登录」，调用 `mcpServers.authorize`，打开系统浏览器，并在 Host 写入 Bearer、重新挂载后重新 list。已连接行列出该服务器已注册的公开工具名。编辑弹窗在表单与 JSON 对象之间切换，分别保留 stdio 与 HTTP 草稿，校验 HTTP(S) URL 和每一行 `KEY=value`，再通过 `upsert` / `delete` / `setEnabled` 编辑受管文档。刷新会重新挂载连接监督器已放弃的受管行，然后重新 list。任一行处于连接中或重连中时，页面轮询 `list`。行显示实时连接健康和最近一次尝试错误。持久化由 Host Remote 负责。

## 模型体验

无，因为这个浏览器 Settings 页不注册提示词、工具、消息或提供方请求。

#### KV Cache 影响

无；本包从不组装模型输入。

## 已知限制与暂缓事项

- **没有市场或 `.mcp.json` 导入** — 添加只是本地表单或 JSON 对象。
