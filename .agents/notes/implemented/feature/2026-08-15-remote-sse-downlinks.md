# Agent Note: Non-loopback browsers use SSE downlinks

Status: implemented

English | [中文](2026-08-15-remote-sse-downlinks.zh.md)

## Problem

Phone remote loads the official web UI through the desktop HTTP reverse proxy. `WorkspaceRuntime` hydrates `session.list` only after `ConnectionController` marks connected. The controller opened `events.mux` and `events.host` before `host.describe`. Two long-lived HTTP downlinks occupy a mobile browser's per-origin HTTP/1.1 slots, so `host.describe` never starts, `onConnected` never fires, and the sidebar stays empty even though unary POST to the same origin returns the Host conversations. Session history is also unary (`session.history`); it never runs if the list handshake never completes. The Host store is not empty: a direct `session.list` against loopback and against the cookie-authenticated relay both return the live rows.

## Decision

`ConnectionController` completes `host.describe` and fires `onConnected` before it opens either event downlink, so `session.list` and `session.history` use the HTTP path that already works. The controller awaits a promise returned by `onConnected` before the WebSocket upgrades, so those unary calls and remaining plugin-bundle fetches are not queued behind two CONNECTING sockets. The runtime's `onConnected` awaits `session.list` and `workspace.list` (and resync of already-open windows), then emits `connection/reset`. `WebApiClient` opens `events.mux` and `events.host` as WebSockets on every origin, including the phone through the relay. The relay forwards the upgrade when the device cookie is present (authenticated `GET /api/events.host` returns 101). Two HTTP SSE GETs are not the phone carrier: they reintroduce the slot starvation that hid the Host list. Ordinary network GETs to `/api/events.*` without `Accept: text/event-stream` still return 426; in-process `AbstractApiClient.readSse` still uses that Accept for tests.

## Alternatives considered

**Treat empty phone UI as a failed current-session restore.** Rejected: the Host list never arrived. Opening the latest row cannot help when `session.list` did not run.

**Open two SSE GETs on non-loopback instead of WebSocket.** Rejected: live relay probes show authenticated WebSocket upgrades succeed. SSE occupies the same HTTP/1.1 pool as `host.describe` / `session.list` / `session.history`; a mobile browser with few per-origin slots then shows no conversations.

**Wait for both stream onOpen before onConnected.** Rejected: that handshake lets a stuck downlink hide the unary store. Live frames still need the downlinks after connect; list and history do not.

## Consequences

Desktop Electron is unchanged aside from opening downlinks after describe and after `onConnected` settles. Phone remote hydrates the Host conversation list as soon as `host.describe` succeeds and the list RPCs return, then upgrades two WebSockets for live frames. Opening those sockets during plugin boot or in parallel with `session.list` occupies the phone's HTTP/1.1 pool so remaining plugin bundles never load (the boot spinner never settles). Tests pin describe-before-downlinks, `onConnected`-promise-before-downlinks, and non-loopback `ws://` URLs.
