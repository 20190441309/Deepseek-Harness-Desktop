# @deepseek-ai/dsh-client-ui-settings-mcp

English | [中文](README.zh.md)

Web Settings section `mcp` (order 18). The page lists managed MCP servers from `ctx.remote.mcpServers` plus read-only composition rows, and edits the managed document through `upsert` / `delete` / `setEnabled`. Product copy is Chinese; the Host Remote owns persistence.

## Model Experience

None, as this browser Settings page registers no prompt, tool, message, or provider request.

#### KV Cache effect

None; this package never assembles model input.

## Known Limitations and Deferred Work

- **No connection probe button** — the row shows fiber phase from the Host snapshot.
- **No marketplace or `.mcp.json` import** — add is a local form only.
