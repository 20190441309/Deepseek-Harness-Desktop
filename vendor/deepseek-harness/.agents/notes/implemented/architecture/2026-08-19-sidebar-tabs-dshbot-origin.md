# Agent Note: Sidebar region tabs, dshbot session origin, and session-only model selection

Status: implemented

English | [中文](2026-08-19-sidebar-tabs-dshbot-origin.zh.md)

## Problem

The left sidebar was a closed geometry shell: plugins could only replace `sidebar.workspaces` wholesale, so a desktop contact list could not sit beside the official session browser. Sessions created for those contacts would also appear in the workspace list, and `session.selectModel` always wrote the user's global default model.

## Decision

`ui-sidebar` declares a list hole `sidebar.nav.tab` and a keyed hole `sidebar.page`. Occupancy is the only signal that draws the tab strip; zero entries keep New Session and `sidebar.workspaces` with no extra chrome. Selecting a plugin tab hides New Session and fills the region from `sidebar.page` keyed by the tab id. Tab components are not mounted; the shell reads `id` / `label` / `order` from the list ledger. The nav store persists `selectedTab` and falls back to `sessions` when the stored id is gone.

`SessionHeader.origin` is `'subagent' | 'dshbot'`. `session.create` may stamp `origin: 'dshbot'` only; `subagent` remains owned by subagent start. List summaries carry origin, and `sessionVisible` hides both. Client `SessionManager.create` forwards `origin` and `agentPreset` and stamps them on the optimistic row so a dshbot session does not flash in the workspace list. ConversationRoot skips EmptyHero for `origin: 'dshbot'` even while the log is empty: the session header stays visible, the composer docks, and ChatView may fill `conversation.chat.empty`. `connectWorkspace` and `connectNoDirectory` refuse to reuse blank rows whose origin is `dshbot` or `subagent`. The session-header agent-preset label hides on `origin: 'dshbot'`.

`session.selectModel` accepts `persistDefault` (default `true`). Passing `false` keeps the switch on that session and does not write `agent-default-model`.

A room is a WhatsApp-style shared transcript: visible bubbles are the user and members only. Code owns speaker selection (`@name` or everyone) and sequential `ask_participant` fan-out through an `llm/stream` short-circuit that never calls a chat model. Each step emits one tool-call; after the last speaker the stream is an empty stop. Each member's prompt is the named group log so far, including earlier speakers this round. Continuable children remember that member in this room. `ask_participant` cards title with the catalog display name and show only that member's reply; pending cards show a thinking avatar. InputBar skips `conversation.input.model` when `agentPreset` is `dshbot-room`.

Catalog items may carry `avatar`: a blob `{ kind: 'blob', shape, color }` or a baked image `{ kind: 'image', dataUrl, crop }`. A missing record hashes the item id or name onto one of eight blob shapes. The editor Modal picks shape and color, or uploads a circle/square crop baked as a small JPEG. Sidebar rows think while `session.running`; `ask_participant` bubbles think while the tool has no result. Generate and an avatar store stay out.

DeepSeek Harness Desktop copies `vendor/dshbot` into the web profile before `dsh.start()`, the same way it installs `dshmarket`, and writes the `dshbot-room` agent preset under `$DSH_HOME/.agent-presets`. `--skip-user-plugins` recovery omits that profile patch, matching the existing desktop-plugin skip.

## Alternatives considered

**Occupy `sidebar.workspaces` with the bot list.** That single hole replaces the official project/session browser, and a plugin cannot import `WorkspaceBrowser`.

**Put bot settings on the right-hand surfaces column.** Surfaces are work loops (Files / Browser / Diff), not an IM profile editor. Edit UI uses `shell.overlay` and `Modal`.

**Let several models write one agent-loop.** One session is one Agent. A room is a technical parent whose preset tool starts continuable children with each member's model.

**Ask an LLM parent to pick the next speaker.** That is AutoGen SelectorGroupChat and the failed Muse Spark dispatcher. Speaker selection stays in code.

**Ship dshbot as an official `packages/client` package.** That would bind an IM product to the 100% coverage gate and the web-app roster for every `dsh web` install. Desktop copies a vendored plugin instead.

**Stamp `origin: 'subagent'` for 1:1 bot sessions.** Subagent origin is lineage for hidden children. dshbot contacts are parent conversations that must stay out of the workspace list without joining that lineage.

**Derive `composerPhase: 'active'` for an empty dshbot log.** The empty-log bit and first-prompt engaging path stay on `derivePhase`. Origin only skips New Session chrome and blank reuse.

## Consequences

Official Web without the desktop plugin is unchanged. Desktop users see a 机器人 tab whose sessions stay out of the project list. Saving a bot model does not move the coding-session default. The dshbot plugin registers `ask_participant` globally; the `dshbot-room` preset restricts the room agent to that tool. Execute refuses a caller that is not a catalog room. The room session never speaks; members receive the named group log and answer in the first person. `ask_participant` cards title with the catalog display name and show that member's speech; spawned members get a complete child persona so they do not inherit the harness identity line. A room composer has no model seat. Bot and room rows show a catalog avatar (blob or cropped image); blob characters morph while that session is running. Opening a never-messaged contact or room shows the conversation chrome and a member roster, not the New Session hero. New Session never lands on those blank rows.

## Testing

`packages/client/ui-sidebar/tests` pin zero-tab chrome and plugin-tab region swap. `packages/client/ui-workspace/tests/tree.client.spec.ts` hides `origin: 'dshbot'`. `packages/host/apiproxy/tests/api-proxy-models.spec.ts` pins `persistDefault: false`. `packages/client/runtime/tests/manager.client.spec.ts` forwards origin on create. `packages/client/ui-conversation/tests/skeleton.client.spec.tsx` skips EmptyHero for a blank `origin: 'dshbot'` session. `packages/client/runtime/tests/workspaces-service.client.spec.ts` refuses blank dshbot/subagent reuse. `packages/client/ui-agent-preset/tests/components.client.spec.tsx` hides the header preset label on `origin: 'dshbot'`. `packages/client/ui-conversation/tests/input-bar.client.spec.tsx` skips `conversation.input.model` when `agentPreset` is `dshbot-room`. Desktop `src/main/dshbot-preset.test.js`, `src/main/dshbot-catalog.test.js`, and `src/main/dshbot-avatar.test.js` pin profile copy, room preset install, catalog helpers (`groupTranscript`, `nextRoomSpeakerId`, sequential `llm/stream` chunks, `emptyRoster`, group-member persona), avatar normalize/size cap, bubbles that never fall back to a dispatcher instruction, `conversation.chat.empty` occupancy, and that the plugin host registers `ask_participant`.
