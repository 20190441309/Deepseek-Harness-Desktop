# @deepseek-ai/dsh-client-ui-settings-skills

English | [中文](README.zh.md)

Web Settings section `skills` (order 16). The page presents `ctx.remote.skillInventory` as a searchable hairline catalog with one source filter. Every Remote call sends the current session's `sessionId` and `cwd` so the Host reads that live Agent's layered catalog. Writable rows expose a model-invocation Switch, open the existing editor, and offer delete; read-only rows omit delete. Create supports either the user root or the active project's `.dsh/skills` root and accepts the initial invocation flags. The catalog follows the current session reactively and suppresses late responses from a previous session or project. The composer `/` picker keeps using `skill.list`.

## Model Experience

None, as this browser Settings page registers no prompt, tool, message, or provider request.

#### KV Cache effect

None; this package never assembles model input.

## Known Limitations and Deferred Work

- **No skill marketplace** — add writes `$DSH_HOME/skills/<name>/SKILL.md`.
- **Live session required for the preset catalog** — without a current session the page sends neither `sessionId` nor `cwd`, so the Host falls back to the global skill layer and project/bundled roots from the standard preset stay out of view.
