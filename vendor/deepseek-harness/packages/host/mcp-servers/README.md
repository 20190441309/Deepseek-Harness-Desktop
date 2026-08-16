# @deepseek-ai/dsh-host-mcp-servers

English | [中文](README.zh.md)

Host Remote `mcpServers` for the Settings MCP page. `list` unions records from [`dsh-mcp-servers-file`](../../mcp/mcp-servers-file/README.md) with live Loader rows whose module name is an mcp-client instance. Managed rows are writable; composition rows are read-only. `upsert`, `delete`, and `setEnabled` write only the managed document and refuse a composition id. Secret values stay masked on `list` because the file service already masks them.

The service is Remote-only and declares no same-process Cordis `Context` merge. Client packages consume it through [`api-remotes`](../../api/remotes/README.md).

## Model Experience

None, as this Host Remote registers no prompt, tool, message, or provider request.

#### KV Cache effect

None; this package never assembles model input.

## Known Limitations and Deferred Work

- **No live tool inventory per server** — the snapshot carries fiber phase, not the current MCP tool list.
- **No Cursor/Claude config import** — Settings writes only `$DSH_HOME/mcp-servers.yaml`.
