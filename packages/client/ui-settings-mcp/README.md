# @deepseek-ai/dsh-client-ui-settings-mcp

English | [中文](README.zh.md)

Web Settings section `mcp` (order 18). The page presents managed MCP servers from `ctx.remote.mcpServers` plus read-only composition rows as a searchable catalog with one enablement filter and hairline rows. Host fiber phase is separate from configured enablement. Writable rows use a Switch plus edit and delete icon actions. The editor Modal switches between a form and a JSON object, preserves independent stdio and HTTP drafts, validates HTTP(S) URLs and every `KEY=value` line, and writes the managed document through `upsert` / `delete` / `setEnabled`. The Host Remote owns persistence.

## Model Experience

None, as this browser Settings page registers no prompt, tool, message, or provider request.

#### KV Cache effect

None; this package never assembles model input.

## Known Limitations and Deferred Work

- **No connection probe button** — the row shows fiber phase from the Host snapshot.
- **No marketplace or `.mcp.json` import** — add is a local form or JSON object only.
