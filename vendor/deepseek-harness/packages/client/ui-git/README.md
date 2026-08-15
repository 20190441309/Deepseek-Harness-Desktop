# @deepseek-ai/dsh-client-ui-git

English | [中文](README.zh.md)

Titlebar trailing plugin: a Session-log-style split button that commits, pushes, and opens a change request through desktop `window.shell` git IPC. The entry sits in `shell.titlebar.trailing` at `id: 'git-actions'`, `order: 20`, between Session log (`order: 10`) and the panel toggles (`order: 40`). Contract: the [slot system standard](../../../.agents/notes/implemented/architecture/2026-07-22-slot-type-chain-implementation.md).

The main-button label follows `resolveQuickAction`. The dropdown is Commit, Push, and Create change request (GitHub wording is Pull request / PR; GitLab uses MR). A missing session `cwd` or a null `gitStatus` disables the main button and shows the hint `Git status is unavailable.` Push and commit_push on the default ref open `resolveDefaultBranchActionDialogCopy` before running.

`GitActionsProps` composes the titlebar trailing owner share, `useSessions` for the current session cwd, injected git IPC callbacks, and the `git` locale seat. There is no plugin store. Desktop methods live only on `window.shell`; the renderer never loads Node.

The `/client` exports are the plugin body (`apply`/`inject`) plus the contract types only; GitActionsControl remains package-internal behind the slot registration.

## Model Experience

None, as the titlebar Git control only drives desktop git IPC; nothing here reaches a model request.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- **Publish repository is not wired** — `resolveQuickAction` may return `open_publish` when there is no origin; the main button stays disabled with `publish.unavailable` and this package does not open a publish wizard.
- **Commit messages are not auto-generated** — an empty commit dialog uses the fallback `Update` instead of a model-written subject.
