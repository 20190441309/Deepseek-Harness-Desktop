# Agent Note: No-directory task sessions

Status: implemented

English | [中文](2026-08-15-no-directory-task-sessions.zh.md)

## Problem

The conversation hero required a Workspace before the composer would accept input, and the sidebar folded Sessions with no Workspace membership under a fake folder row labelled Ungrouped. Operators who wanted a chat without adopting a project directory still had to pick or create a Workspace, which either registered a directory they did not mean to keep or left the composer inert.

Adding a Workspace still has one route — pick a host directory ([one-route Note](../simplification/2026-07-31-one-route-to-add-a-workspace.md)). A no-directory Session must not become a second `workspace.create` path. Its cwd also must not equal a real Workspace path or `process.cwd()`, or membership projection would absorb the Session into a Project.

The hero Workspace chip toggles picker open state, but the picker Menu is a sibling (`anchor={null}` plus `getAnchorRect`). A second click on the chip reached the Menu as an outside `pointerdown` (close) and then the chip `click` (reopen), so the menu never stayed closed.

## Decision

`host.describe` advertises `scratchCwd`. The Host resolves it with `dshHomePath('no-workspace')` (`$DSH_HOME/no-workspace` or `~/.dsh/no-workspace`) and `mkdir`s it during describe. The browser never joins that path.

`IWorkspaces.connectNoDirectory()` reuses a blank Session whose cwd equals `scratchCwd` and whose id is in no Workspace `sessionIds` and not archived; otherwise it calls `session.create({ cwd: scratchCwd })`. It never calls `workspace.create`. In-flight calls coalesce. Callers own navigation (`sessions.open`).

The hero picker pins **无工作目录** / **No workspace folder** (`menu.noDirectory`, `IconNewChatOutline16`) above **添加工作区…**. Selecting it injects `selectNoDirectory` from ui-conversation apply, which carries the current draft then opens the connected Session. A Session with no Workspace membership shows that copy on the chip (never the scratch directory basename) and unlocks the composer. Cold start with no Session still uses the Choose-workspace placeholder and an inert composer. `addIsTheOnlyEntry` stays true only when the add-only sidebar surface has a single add action; the empty hero list keeps its menu because No workspace folder and Add workspace are two choices.

The grouped sidebar splits **项目** (`section.projects`) from **任务** (`section.tasks`). Project rows keep folder chrome, menus, drag, and `startSession`. Tasks has no `ProjectRowItem`: sessions sit under a collapsible header at the same indent as sessions under a project, the section `+` calls `connectNoDirectory`, and an empty Tasks section is omitted. Top-level New Session still uses `startSession`.

The hero chip `pointerdown` calls `stopPropagation()` so the sibling Menu's outside-close cannot race the click toggle, matching the InputBar card.

## Alternatives considered

**Register scratch as a Workspace.** Rejected: that would be a second add-workspace route and would show a folder the operator never picked. Workspace membership stays directory adoption only.

**Use the operator home directory or `process.cwd()` as the default cwd.** Rejected: either path can equal an existing Workspace, so a no-directory Session would project as a Project member.

**Move the chip into the Menu `anchor` the way Minimal Mode does.** Rejected: the chip lives in ui-conversation and the Menu in ui-workspace; collapsing that slot split just to skip one event is worse than stopping `pointerdown` on the chip.

**Keep Ungrouped as a fake Workspace folder row.** Rejected: operators asked for a Tasks list, not a folder named Ungrouped; the `+` on that row also called `startSession` and landed in the recent Workspace.

## Consequences

No-directory Sessions are Host Sessions with a Host-owned cwd and no Workspace index entry. Deleting a Workspace registration still drops its members into Tasks. Tests pin chip toggle (pointerdown does not reach `document`), composer unlock without membership, picker footer without `createWorkspace`, Tasks `+` calling `connectNoDirectory`, Host `scratchCwd` existing as a directory, and runtime reuse versus create. Client plugin bundles must be rebuilt after these packages change; Host `describe` changes need a full desktop restart.
