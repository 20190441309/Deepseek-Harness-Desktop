# @deepseek-ai/dsh-client-ui-preview

English | [中文](README.zh.md)

Right-panel Browser occupant of `surfaces.browser` (`single`, `session-maybe`, declared by ui-surfaces). Desktop-only preview of a local URL or app. The renderer owns the URL bar and reports the host rectangle; Electron attaches a `BrowserView` on that rectangle through `window.shell.preview*`. Contract: the [slot system standard](../../../.agents/notes/implemented/architecture/2026-07-22-slot-type-chain-implementation.md).

`previewOpen('http://127.0.0.1:*')` succeeds. Non-local document navigation is rejected. Subresource loads (fonts, scripts, images) from remote CDNs are allowed so local Vite/Next apps render; top-level and iframe navigations stay on loopback. The guest uses the isolated `dshd-preview` partition and never sends the user API key (same spirit as harness web: credentialed requests do not follow redirects). Outside Electron the empty-state card and this panel show `Browser previews are only available in the desktop app.` Discovered loopback ports stay listed while the occupant is mounted; a chip opens or navigates the guest. Chrome is icon Back / Forward / Reload, an `Input` that submits on Enter (`Search or enter URL`), a system-browser icon that uses the URL bar even before a guest exists, and a More menu for DevTools. Guest `did-navigate` / `did-navigate-in-page` emit `shell:preview-state-change` so the URL bar and back/forward follow in-guest navigation. Inactive or renderer-occluded surface tabs keep the guest alive while removing its native view (`previewHide`); the More menu also hides the guest while open; closing the Browser tab unmounts the panel and calls `previewClose`.

The `/client` exports are the plugin body (`apply`/`inject`) plus the contract types only; PreviewPanel remains package-internal behind the slot registration.

## Model Experience

None, as the Browser surface only previews a local URL; nothing here reaches a model request.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- **One guest at a time** — the surfaces store holds a single preview; there is no tab strip inside the occupant.
- **No device, PiP, or recording toolbar** — this desktop has no session metadata for those preview chrome pieces.
