# @deepseek-ai/dsh-host-skill-inventory

English | [中文](README.zh.md)

Host Remote `skillInventory` for the Settings Skills page. `list` and `get` read `ctx.skills` without the composer `isUserInvocable` filter and add `path`, `source`, and `writable`. `create` writes `$DSH_HOME/skills/<name>/SKILL.md` or `<cwd>/.dsh/skills/<name>/SKILL.md`. `update`, `delete`, and `setInvocation` write only `user-dsh`, `user-agents`, and — when `cwd` is present — `project-dsh` / `project-agents` files. Enablement is the existing frontmatter pair `disable-model-invocation` and `user-invocable`. Bundled, runtime, and custom skills stay read-only.

The service is Remote-only. Client packages consume it through [`api-remotes`](../../api/remotes/README.md). The composer `skill.list` RPC is unchanged.

## Model Experience

None, as this Host Remote registers no prompt, tool, message, or provider request.

#### KV Cache effect

None; this package never assembles model input.

## Known Limitations and Deferred Work

- **No skill marketplace** — create writes local files; install-from-catalog is out of scope.
- **Name is immutable after create** — rename is a delete plus create.
