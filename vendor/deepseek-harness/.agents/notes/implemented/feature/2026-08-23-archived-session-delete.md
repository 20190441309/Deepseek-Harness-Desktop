# Agent Note: Archived-session log deletion

Status: implemented

English | [中文](2026-08-23-archived-session-delete.zh.md)

## Problem

Archive hides a session from every grouping surface while leaving its durable log and workspace `sessionIds` slot intact. Users still need a way to destroy that log after they have parked the row under Archived. `host/session-removed` cannot carry that meaning: it detaches a live owner (and may keep a durable subagent summary idle). `parentSession` is seed lineage for both forks and subagents, so a naive subtree walk would delete forks. A `ctx.agents.create` / `resume` that returns only `.agent` and drops `AgentHandle` leaves dispose-before-unlink with no owner.

## Decision

**Destroy is archived-root-only, confirmed in the sidebar, Host-orchestrated as dispose-then-persist-delete, and published as `host/session-deleted`.** Persistence `delete` removes one session-owned durable log; the Host decides the subtree and the live-owner lifecycle.

### Product surface

The live session row menu offers archive, rename, and fork only — no Delete. Restore and destroy appear only under the bottom **Archived** / **已归档** section. Clicking an archived row still unarchives then opens; Delete is menu-only while the row remains archived (`⋯` → **Delete session** / **删除会话**, `danger: true`). The confirmation Modal matches Workspace registration deletion: pending disables Cancel and Confirm; failure keeps the dialog open; Escape / Cancel / Close before submit do not call `session.delete`; the dialog closes only after the archive-set echo no longer contains the committed id. Copy states that the conversation log is gone forever and that the workspace folder is unchanged. `session-running` maps to `delete.session.running`; other failures show as message text.

### Deletable set

`session.delete({ sessionId })` names one **root**. That root must already be in `ctx.workspaceRegistry.archivedSessionIds`, else `session-not-archived` (unknown id → `session-not-found`). The deletable set is `{root}` plus every persisted or live header with `origin === 'subagent'` whose `parentSession` is already in the set, iterated to a fixed point (nested subagents included). Forks (`parentSession` set, `origin` absent) and `origin: 'dshbot'` are excluded. Any agent in the set with `status === 'running'` deletes nothing and returns `session-running`.

### Live handles and dispose-then-delete

Host keeps `Map<SessionId, AgentHandle>` populated on every successful `ctx.agents.create` / `resume`, including `ensureSession` create/resume, fork create, and a wrap of `ctx.agents.resume` so GUI open (history / models via `agentFor`) retains the handle `session.delete` needs. `retainHandle` is idempotent when the mapped agent is already that live instance. Dispose removes the map entry. A live `ctx.agents.get(id)` without a handle fails the whole call with `session-live-unowned` — Host does not invent a second teardown on `AgentRegistry`. Cold archived sessions with no live agent skip dispose. Idle live owners are disposed through `AgentHandle.dispose()` **before** persistence delete; persistence never calls into runtime.

### Persistence and commit

Persistence delete is leaf-to-root. `persist.delete` skip-on-rejection happens only when a follow-up `list()` shows the id gone (crash resume). If the id is still listed, or listing itself fails, the original error is rethrown: the RPC does not unarchive, detach, or publish success. After durable commit Host `unarchiveSession(root)`, `detachSession`s the whole set from every workspace, then publishes `host/session-deleted` per deleted id. `session/disposed` does **not** emit `host/session-removed` while those ids are in `deletingIds`. Success is `{ deletedSessionIds, archivedSessionIds }`. Attachment blobs are not garbage-collected. Message-feedback sidecars are not cascaded.

### Frames

`host/session-deleted` means durable log destruction. Clients always `recordMutation({ kind: 'remove', sessionId })` and drop the summary for every deleted id, including former subagents. They do not use the durable-subagent idle path of `host/session-removed`.

## Alternatives considered

**Overload `host/session-removed` for log destruction.** Rejected: that frame is detach / idle subagent; feedback and client idle paths already treat it as non-destruction.

**Put Delete on the live session row.** Rejected: the product path is archive (hide, keep log) then destroy only under Archived with confirm.

**Delete every child that carries `parentSession`.** Rejected: forks use `parentSession` as seed lineage without `origin`; only `origin === 'subagent'` is a hidden child of the archived root.

**Garbage-collect attachment blobs in the same RPC.** Rejected: forks share blobs; blob GC is a later persistence concern.

**Cascade message-feedback sidecars.** Rejected: feedback storage is a separate domain; this round destroys the session log only.

**Invent a second `AgentRegistry` teardown when a live agent has no retained handle.** Rejected: fail closed with `session-live-unowned` so an unowned live owner cannot be unlinked out from under the runtime.

**Treat every `persist.delete` rejection as crash-resume skip.** Rejected: a backend can reject while the log remains; skip only when a follow-up list shows the id gone.

## Testing

Persistence contract tests pin `delete` (unknown id rejects; un-materialized create cancels; stored id leaves `load`/`list`). Host `api-proxy-session-delete` pins not-archived, ghost id, running (nothing deleted), recursive `origin === 'subagent'` inclusion with fork/`dshbot` exclusion, leaf-to-root persist order, live idle dispose, `session-live-unowned` on register-without-resume, persist-failure that leaves the log, missing-id skip, and `ctx.agents.resume` retain then archive then delete. Client runtime drops every summary on `host/session-deleted`. ui-workspace component tests pin confirm / cancel / live-row-no-delete / archived danger Delete / `session-running` copy. workspace-management e2e pins archive → confirm delete → reload: row gone, id absent from `sessionPersistence.list()`, JSONL session directory `ENOENT`, workspace file unchanged. Production `TC-CHAT-013` is pending on CI Setup after 0.2.8.

## Consequences

Confirmed Archived delete permanently removes the conversation log directory (JSONL `sessionDir`) and nested `origin === 'subagent'` logs; the workspace folder and fork children of that root remain. Open → archive → delete works because Host wraps `ctx.agents.resume` into the handle map. Attachment blobs and message-feedback rows can outlive the deleted log until those domains gain their own GC.

## Related

[Session archive (registry-global set)](2026-07-31-session-archive-global-set.md). [Workspace registration deletion](2026-07-27-workspace-registration-deletion.md). [Session persistence seam](../architecture/2026-06-14-session-persistence.md).
