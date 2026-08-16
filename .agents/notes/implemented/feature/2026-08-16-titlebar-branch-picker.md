# Agent Note: Titlebar branch picker ported from T3code

Status: implemented

English | [中文](2026-08-16-titlebar-branch-picker.zh.md)

## Problem

The titlebar Git cluster could commit, push, and open change requests, but switching or creating a branch required the terminal. T3code ships a branch selector (search, inline create, remote dedupe) whose interaction model this product wanted verbatim; its component stack (Tailwind, shadcn, lucide, zustand, server-held worktrees) cannot be pasted into this design system.

## Decision

Port the selector in three layers. Pure logic is taken directly from T3code (MIT, © T3 Tools Inc.): `deriveLocalBranchNameFromRemoteRef`, `dedupeRemoteBranchesWithLocalMatches`, and `shouldIncludeBranchPickerItem` live in `ui-git/src/client/branches.ts` with Effect/t3 imports rewritten as plain TypeScript and behavior preserved. Interaction follows T3code: trigger shows the current ref, the panel searches as you type, an unknown query offers `Create branch "…"`, `origin/*` rows whose local branch exists are hidden, the current row is disabled, and a failed action keeps the panel open with an error line instead of closing silently. The chrome is this system's: `Button`/`Input` atoms, `--dsw-alias-*` tokens, and the shared scrollbar rebind for the elevated scrolling panel.

The backend adds three desktop IPC channels — `shell:git-branch-list` (`for-each-ref` + `symbolic-ref` for the origin/HEAD default), `shell:git-switch-branch` (`git checkout`), `shell:git-create-branch` (`git checkout -b`) — all rooted through `workspace-authority` like every other git op. Ref names are validated against `^[A-Za-z0-9][A-Za-z0-9._/-]*$` with `..`, `.lock`, and trailing-slash rejections before they reach argv, so a model-supplied ref cannot smuggle options or traversal.

T3code's worktree environments and thread↔branch binding are deliberately NOT ported: they are welded to T3code's server thread metadata (per-thread `worktreePath`, env modes, session stop-on-switch). This harness has no such session metadata; faking the selector half without the lifecycle would lie. They remain candidates for a later, harness-native design.

## Alternatives considered

**Paste the T3code component wholesale.** Rejected: Tailwind/shadcn/lucide/zustand break the mandatory dsw design language, the slot catalog, and the lint gates; the component also talks to T3code server atoms that do not exist here.

**Branch operations through the terminal only.** Rejected: the titlebar already owns the Git loop (commit/push/PR); a branch detour through the terminal breaks that loop for the most common ref action.

**Port worktree/env-mode too.** Deferred: requires per-session branch metadata and worktree lifecycle management inside the authorization root — a design decision, not a port.

## Consequences

The titlebar Git cluster is now a complete ref loop: switch, create, commit, push, PR. `git.test.js` pins list/switch/create round-trips and unsafe-ref rejection; `branch-menu.client.spec.tsx` pins the ported pure functions and the panel interaction (search, create row, switch callback, failure keeps the panel open). The picker renders only when the session cwd is a repository; outside git it stays hidden and the Initialize Git flow keeps its place.

## Related

[Desktop surfaces integration hardening](../architecture/2026-08-15-desktop-surfaces-integration-hardening.md) owns the workspace-authority root this picker routes through. T3code (`C:\ai\t3code`, MIT) is the behavioral source; `apps/web/src/components/BranchToolbarBranchSelector.tsx` and `packages/shared/src/git.ts` are the upstream files.
