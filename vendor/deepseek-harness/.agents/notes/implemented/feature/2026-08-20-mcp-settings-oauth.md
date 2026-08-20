# Agent Note: MCP Settings signs in HTTP servers

Status: implemented

English | [中文](2026-08-20-mcp-settings-oauth.zh.md)

## Problem

A managed Streamable HTTP MCP server that requires OAuth (Ardot, and any 401 `resource_metadata` challenge) could be added in Settings, but DSH never opened a login. The Host mounted a naked URL, health stayed `failed`, and chat never received that server's tools. Copying a token from another client is not a product path.

## Decision

`mcpServersFile.authorize(id)` discovers protected-resource and authorization-server metadata, registers a public PKCE client, opens the system browser, exchanges the code, writes `Authorization: Bearer …` on that managed HTTP record, and remounts the mcp-client child so `ctx.tools` carries the server's tools for every session. Host Remote `mcpServers.authorize` is loopback-only and refuses a composition id. Settings shows **登录** on an enabled managed HTTP row that is not connecting, reconnecting, or connected. A connected row lists the public `mcp__<serverName>__…` names from `connection.tools`.

## Alternatives considered

**Store only a Cursor-copied access token in yaml.** Rejected: the user never sees a DSH login, Host may not remount, and the token expires with no way back inside the product.

**Automatic OAuth inside `dsh-mcp-client` on the first 401.** Rejected: opening a browser is a Settings/Host user gesture, not a silent reconnect side effect.

**Persist refresh tokens in a sidecar and renew without the browser.** Deferred: v1 writes the access token as a header; expiry shows 连接失败 and 登录 again.

## Consequences

The user adds `https://ardot.tencent.com/mcp` (or any OAuth HTTP MCP), clicks 登录, finishes the browser prompt, and Settings lists the registered tool names on that row. The next chat turn can call `mcp__<serverName>__…` tools. stdio rows have no 登录. Composition rows stay read-only. Catalog ownership stays in [MCP and Skill settings management](2026-08-14-mcp-and-skill-settings.md).

## Testing

`authorizeMcpHttp` runs PKCE against mocked discovery/token endpoints and refuses a server that does not challenge. `mcpServersFile.authorize` writes the bearer and remounts an HTTP row, and refuses stdio or an unknown id. The Host gateway publishes `authorize` and refuses a composition id. A connected `list` row carries `connection.tools`. Client tests show 登录 only on a failed managed HTTP row, call `authorize` with that id, and render registered tool names on a connected row. Connection allowlists include `mcpServers/authorize`.

## Related

[MCP and Skill settings management](2026-08-14-mcp-and-skill-settings.md).
[MCP Settings polls health and remounts given-up children](../bug-fix/2026-08-20-mcp-settings-stale-health.md).
