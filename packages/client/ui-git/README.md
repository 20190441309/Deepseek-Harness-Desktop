# @deepseek-ai/dsh-client-ui-git

English | [中文](README.zh.md)

Titlebar trailing plugin: a Session-log-style split button that commits, pushes, and opens a change request through desktop `window.shell` git IPC. The entry sits in `shell.titlebar.trailing` at `id: 'git-actions'`, `order: 20`, between Session log (`order: 10`) and the panel toggles (`order: 40`). Contract: the [slot system standard](../../../.agents/notes/implemented/architecture/2026-07-22-slot-type-chain-implementation.md).

The main-button and dropdown labels follow `resolveQuickAction` / T3code English (`Commit, push & PR`, `Commit & push`, `Push & create PR`) in both locales. The commit dialog matches T3code: branch, file list with `+/-` counts, optional message, Cancel / Commit on new refName / Commit. Stacked commit/push/PR and Pull open a top-right progress card immediately (spinner, phase title, elapsed `Running for Ns` or the latest hook line) and keep success or failure on that same card; hook dumps no longer wait in silence and then fill a modal. Pull is `git pull --ff-only`, matching T3code. Default-ref confirm offers Abort and continue on this ref; Checkout feature branch & continue appears only when the action includes a commit. Other dialogs and hints still use the `git` dictionary. GitHub wording is Pull request / PR; GitLab uses MR. A missing session `cwd` or a null `gitStatus` disables the main button and shows the hint `Git status is unavailable.` An authorized cwd with `isRepo: false` replaces the split button with Initialize Git and calls `gitInit`. Push and commit_push on the default ref open `resolveDefaultBranchActionDialogCopy` before running. `hasPrimaryRemote` defaults to false when the status omits it. Create PR is offered only when status includes a GitHub `sourceControlProvider`.

`GitActionsProps` composes the titlebar trailing owner share, `useSessions` for the current session cwd, injected git IPC callbacks, and the `git` locale seat. There is no plugin store. Desktop methods live only on `window.shell`; the renderer never loads Node.

The `/client` exports are the plugin body (`apply`/`inject`) plus the contract types only; GitActionsControl remains package-internal behind the slot registration.

## Model Experience

None, as the titlebar Git control only drives desktop git IPC; nothing here reaches a model request.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- **Publish uses `gh` or a remote URL** — there is no multi-provider OAuth wizard. The dialog runs `gh repo create --source=. --remote=origin --push`, or `git remote add` plus push when the user pastes a URL.
- **Commit and PR copy use the desktop API key** — empty messages call DeepSeek chat when `loadConfig().apiKey` is set and fail the action if that request fails; without a key they use a staged name-status / range heuristic. This is not T3code's pluggable writer-model plane.
- **Worktree and thread↔branch binding are not ported** — this desktop has no per-session worktree metadata.
- **Change requests go through `gh` on GitHub remotes** — an already-open PR is reused via `gh pr list --head`; fork creates pass `--head owner:branch`. Non-GitHub remotes fail closed (GitLab `glab` / other CLIs are not ported). A missing `gh` after commit+push fails the stacked action on the toast.
- **Open file uses the OS default app** — the commit dialog opens paths with `shell.openPath`, not T3code's preferred-editor plane.
- **Pull is fast-forward only** — `git pull --ff-only`, matching T3code; stash and rebase appear only as disabled menu hints.
