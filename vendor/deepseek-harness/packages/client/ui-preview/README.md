# @deepseek-ai/dsh-client-ui-preview

English | [中文](README.zh.md)

Right-panel Browser occupant of `surfaces.browser` (`single`, `session-maybe`, declared by ui-surfaces). Desktop-only preview of a local URL or app. The renderer owns the URL bar and reports the host rectangle; Electron attaches a `BrowserView` on that rectangle through `window.shell.preview*`. Contract: the [slot system standard](../../../.agents/notes/implemented/architecture/2026-07-22-slot-type-chain-implementation.md).

`previewOpen('http://127.0.0.1:*')` succeeds. Non-local navigation is rejected. The guest uses the isolated `dsh-preview` partition and never sends the user API key (same spirit as harness web: credentialed requests do not follow redirects). Outside Electron the empty-state card and this panel show `Browser previews are only available in the desktop app.`

The `/client` exports are the plugin body (`apply`/`inject`) plus the contract types only; PreviewPanel remains package-internal behind the slot registration.

## Model Experience

None, as the Browser surface only previews a local URL; nothing here reaches a model request.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- **One guest at a time** — the surfaces store holds a single preview; there is no tab strip inside the occupant.
- **No discovered-port picker** — the user types a loopback URL; the panel does not scan local servers.
