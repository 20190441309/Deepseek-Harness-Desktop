# Agent Note: MCP and Skill settings management

Status: implemented

English | [中文](2026-08-14-mcp-and-skill-settings.zh.md)

## Problem

Harness already connects MCP servers through `dsh-mcp-client` and discovers skills through `dsh-skill-filesystem`, but neither catalog had a Settings management page. Users had to edit `cordis.patch.yml` or skill files by hand. Desktop has no separate persistence for these catalogs: they belong under `$DSH_HOME` and must work for CLI and Web alike.

## Decision

Settings grows two sections: `mcp` (order 18) and `skills` (order 20). Neither writes the user's `cordis.patch.yml`. Desktop only jumps to those sections through the existing `openHarnessSettings('mcp'|'skills')` menu path.

MCP persistence is `$DSH_HOME/mcp-servers.yaml`, owned by `@deepseek-ai/dsh-mcp-servers-file` on the base bundle. The file plugin mounts one `dsh-mcp-client` child per enabled record and reconciles on write or watch. `@deepseek-ai/dsh-host-mcp-servers` publishes Typert Remote `mcpServers` (`list` / `upsert` / `delete` / `setEnabled`). `list` unions managed rows with live Loader mcp-client instances. Composition rows are read-only (`origin: 'composition'`). Secret-looking env and header keys are masked on list; a blank or `********` upsert keeps the stored value.

Skill enablement stays the existing SKILL.md frontmatter pair `disable-model-invocation` and `user-invocable`. `@deepseek-ai/dsh-host-skill-inventory` publishes Typert Remote `skillInventory` (`list` / `get` / `create` / `update` / `delete` / `setInvocation`). `list` reads `ctx.skills` without the composer `isUserInvocable` filter. Writable roots are `user-dsh`, `user-agents`, and — when the current session supplies `cwd` — `project-dsh` / `project-agents`. Bundled, runtime, and custom skills stay read-only. Create writes `$DSH_HOME/skills/<name>/SKILL.md` by default. Composer `skill.list` is unchanged.

`@deepseek-ai/dsh-client-ui-settings-mcp` and `@deepseek-ai/dsh-client-ui-settings-skills` register the Settings pages. Product copy is Chinese.

## Alternatives considered

**Write MCP rows into the user's `cordis.patch.yml`.** Rejected because that file may contain `!!js` and other hand-authored composition, and Settings must not become a YAML editor.

**A new skill enablement list beside frontmatter.** Rejected because `dsh-skill-filesystem` already owns invocation flags; a second list would drift from the files the watcher already reloads.

**Desktop `window.shell` APIs for these catalogs.** Rejected because persistence is `$DSH_HOME` and Settings already lives in the Harness Web UI. Desktop only needs the same section jump About and Plugins already use.

**Import Cursor or Claude `.mcp.json` in v1.** Rejected. The managed YAML is reserved for a later importer; v1 only reads and writes its own document.

## Consequences

CLI and Web share one MCP catalog because the file plugin sits on the base bundle. Hand-written mcp-client rows keep connecting and appear in Settings as read-only composition. Skill create/edit/delete refresh through the existing filesystem watcher, so the composer `/` menu follows the files. There is no marketplace, no connection-test button (rows show `fiberPhase`), and no change to `$` tokens or the composer picker.

## Testing

Host suites cover YAML CRUD, illegal `serverName`, duplicate ids, composition write refusal, skill kebab-case, read-only roots, and frontmatter flags. Client `test:gui` covers both Settings pages: list, form, enablement, and delete confirmation, fed through props.
