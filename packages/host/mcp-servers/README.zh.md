# @deepseek-ai/dsh-host-mcp-servers

[English](README.md) | 中文

为 Settings 的 MCP 页提供 Host Remote `mcpServers`。`list` 把 [`dsh-mcp-servers-file`](../../mcp/mcp-servers-file/README.zh.md) 中的记录与 Loader 里模块名为 mcp-client 的存活行合并。受管行可写；组成配置行只读。`upsert`、`delete` 与 `setEnabled` 只写受管文档，并拒绝组成配置 id。`list` 中的密钥已被文件服务掩码。

该服务仅供 Remote 使用，不声明同进程 Cordis `Context` merge。Client 包通过 [`api-remotes`](../../api/remotes/README.zh.md) 消费。

## 模型体验

无，因为这个 Host Remote 不注册提示词、工具、消息或提供方请求。

#### KV Cache 影响

无；本包从不组装模型输入。

## 已知限制与暂缓事项

- **没有按 server 列出的实时工具清单** — 快照只带 fiber 阶段，不含当前 MCP 工具列表。
- **不导入 Cursor/Claude 配置** — Settings 只写 `$DSH_HOME/mcp-servers.yaml`。
