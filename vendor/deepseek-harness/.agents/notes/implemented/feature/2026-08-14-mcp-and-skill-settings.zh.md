# Agent Note: MCP and Skill settings management

Status: implemented

[English](2026-08-14-mcp-and-skill-settings.md) | 中文

## Problem

Harness 已经能通过 `dsh-mcp-client` 连接 MCP 服务器、通过 `dsh-skill-filesystem` 发现技能，但两份目录都没有 Settings 管理页。用户只能手改 `cordis.patch.yml` 或技能文件。桌面端也不该另做一份持久化：这些目录属于 `$DSH_HOME`，CLI 与 Web 必须共用。

## Decision

Settings 增加两个栏目：`mcp`（order 18）和 `skills`（order 20）。两者都不写用户的 `cordis.patch.yml`。桌面端只通过已有的 `openHarnessSettings('mcp'|'skills')` 菜单跳转。

MCP 持久化是 `$DSH_HOME/mcp-servers.yaml`，由挂在 base bundle 上的 `@deepseek-ai/dsh-mcp-servers-file` 拥有。文件插件为每条已启用记录挂载一个 `dsh-mcp-client` 子实例，并在写入或监视时 reconcile。`@deepseek-ai/dsh-host-mcp-servers` 发布 Typert Remote `mcpServers`（`list` / `upsert` / `delete` / `setEnabled`）。`list` 合并受管行与 Loader 里存活的 mcp-client 实例。组成配置行只读（`origin: 'composition'`）。看起来像密钥的 env / header 在 list 时掩码；空字符串或 `********` 的 upsert 保留已存值。

技能启停仍写已有 SKILL.md frontmatter：`disable-model-invocation` 与 `user-invocable`。`@deepseek-ai/dsh-host-skill-inventory` 发布 Typert Remote `skillInventory`（`list` / `get` / `create` / `update` / `delete` / `setInvocation`）。`list` 读取 `ctx.skills`，不过滤 composer 的 `isUserInvocable`。可写根是 `user-dsh`、`user-agents`，以及当前 session 提供 `cwd` 时的 `project-dsh` / `project-agents`。bundled、runtime 与 custom skill 只读。创建默认写入 `$DSH_HOME/skills/<name>/SKILL.md`。composer 的 `skill.list` 不变。

`@deepseek-ai/dsh-client-ui-settings-mcp` 与 `@deepseek-ai/dsh-client-ui-settings-skills` 注册 Settings 页。产品文案为中文。

## Alternatives considered

**把 MCP 行写进用户的 `cordis.patch.yml`。** 否决，因为该文件可能含 `!!js` 和其他手写组成，Settings 不能变成 YAML 编辑器。

**在 frontmatter 之外再做一份技能启用清单。** 否决，因为 `dsh-skill-filesystem` 已经拥有调用开关；第二份清单会与监视器已在重载的文件漂移。

**用桌面 `window.shell` API 管这些目录。** 否决，因为持久化属于 `$DSH_HOME`，Settings 已在 Harness Web UI 里。桌面端只需要 About / Plugins 已经在用的栏目跳转。

**v1 导入 Cursor 或 Claude 的 `.mcp.json`。** 否决。受管 YAML 留给后续导入器；v1 只读写自己的文档。

## Consequences

文件插件挂在 base bundle 上，因此 CLI 与 Web 共用同一份 MCP 目录。手写的 mcp-client 行继续连接，并在 Settings 里显示为只读组成配置。技能的增删改通过已有文件系统监视器刷新，composer 的 `/` 菜单跟着文件变。没有市场、没有连接测试按钮（行上显示 `fiberPhase`），也不改 `$` token 或 composer 选择器。

## Testing

Host 套件覆盖 YAML CRUD、非法 `serverName`、重复 id、组成配置拒绝写入、技能 kebab-case、只读根，以及 frontmatter 开关。Client `test:gui` 覆盖两个 Settings 页的列表、表单、启停和删除确认，通过 props 喂入。
