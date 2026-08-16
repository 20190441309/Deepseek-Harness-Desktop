# @deepseek-ai/dsh-client-ui-diff

English | [中文](README.zh.md)

Right-panel Diff occupant of `surfaces.diff` (`single`, `session-maybe`, declared by ui-surfaces). Shows the workspace change list and unified hunks from desktop `window.shell.gitDiff(cwd)`. When porcelain `gitStatusEntries` is present, staged and unstaged groups get Stage / Unstage / Discard. Filename clicks call owner `openFile`. When `gitStatus(cwd)` is null the panel shows the T3code reason `Diff is only available for server threads in Git repositories.` Contract: the [slot system standard](../../../.agents/notes/implemented/architecture/2026-07-22-slot-type-chain-implementation.md).

Workspace root is the current session `cwd` from one `useSessions` read. The renderer never loads Node.

The `/client` exports are the plugin body (`apply`/`inject`) plus the contract types only; DiffPanel remains package-internal behind the slot registration.

## Model Experience

None, as the Diff surface only reads git for display; nothing here reaches a model request.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- **Working-tree only** — there is no turn-diff, branch-base picker, or split view.
- **Titlebar Commit is unchanged** — Diff stage/unstage/discard does not replace `git add -A`.
