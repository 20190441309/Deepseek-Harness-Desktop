# @deepseek-ai/dsh-client-ui-settings-skills

English | [中文](README.zh.md)

Web Settings section `skills` (order 20). The page lists `ctx.remote.skillInventory` rows grouped by source and writes user skills through `create` / `update` / `delete` / `setInvocation`. Product copy is Chinese. The composer `/` picker keeps using `skill.list`.

## Model Experience

None, as this browser Settings page registers no prompt, tool, message, or provider request.

#### KV Cache effect

None; this package never assembles model input.

## Known Limitations and Deferred Work

- **No skill marketplace** — add writes `$DSH_HOME/skills/<name>/SKILL.md`.
- **Project skills need a cwd** — the page reads the current session cwd; with no session it lists only user and bundled skills.
