# Agent Note: Conversation links into Files and Browser

Status: implemented

English | [中文](2026-08-19-conversation-surface-links.zh.md)

## Problem

Desktop conversation already had two work loops that never met. File mentions, produced chips, and tool-row paths call `workspaces.openPath`, which the surfaces interceptor turned into a Files `file:` tab only, so `.html` / `.svg` opened as source. Markdown and inline-code http(s) used `target="_blank"`, and the Harness BrowserView `setWindowOpenHandler` sent every http(s) URL to `shell.openExternal`, including loopback. Terminal already routed loopback through `dshd-open-surface` and `dshd-pending-preview-url`. [Opening a produced file from the web UI](2026-07-31-web-workspace-file-links.md) rejected serving workspace files from the harness origin (same-origin `/api` leak) and recorded a desktop WebView as the remaining isolation. `file:` cancelled; guest documents may be any http(s); harness main window stays loopback.

## Decision

**Workspace HTML/SVG opens Files then Browser.** Desktop `wrapOpenPath` awaits `openInSurfaces`. After `openFile` and `layout.openSurfaces()`, `.html` / `.htm` / `.xhtml` / `.svg` (the same set Host `openPath` treats as browser documents) call `previewWorkspaceFile({ cwd, relativePath })`. On `{ ok, url }` the interceptor writes `dshd-pending-preview-url` then dispatches `dshd-open-surface` with `{ kind: 'preview', url }`, so the active tab is Browser and the source tab remains. Missing, throwing, or refusing IPC leaves Files, does not throw, and does not fall through to OS `openPath`.

**A token-prefixed GET-only listener serves those files.** The URL is `http://127.0.0.1:{port}/{token}/{relative}` and the socket binds only `127.0.0.1`. The token is 16 bytes `base64url` (≥96 bit) per resolved cwd. GET without the token is 404. POST/PUT/DELETE are 405. `Host` must be `127.0.0.1` (optional port). Responses send `X-Content-Type-Options: nosniff`. The path is decoded once then `resolveInside`. Directories are not listed and `index.html` is not followed; `fileUrl` of a directory fails and GET of a directory is 403. The preview origin can `fetch` other files under the same token (including `.env`); isolation is from the harness `/api` origin and from unauthenticated port scans, not a page sandbox. `preview.closeAll` / Harness restart close the listener and drop tokens.

**Denied Harness loopback that is not the harness origin opens Browser.** `ensureHarnessView` passes `openDeniedLoopback`. `setWindowOpenHandler` and denied `will-navigate` send `shell:open-preview-url` on that same `contents` with `rewriteLoopbackLoadUrl` when the URL is loopback and `allowUrl` is false. A harness-origin popup is denied with neither preview nor `openExternal`. Remote http(s) still `openExternal`. `will-redirect` still only denies. Boot windows omit `openDeniedLoopback`. `ui-surfaces` `apply` subscribes `onOpenPreviewUrl` and dispatches the same CustomEvent as terminal. Each package repeats the two event/storage strings.

**Out of this change.** Markdown relative links stay stripped by `sanitizeUrl`. Preview still rejects `file:`. Files tree clicks still open source only. Clicking an HTML file uses this static server, not a discovered Vite port; clicking `http://127.0.0.1:5173` opens that server. Root-absolute `/style.css` inside a previewed page 404s (relative URLs work). Terminal Cmd-click of `.html` dual-opens because it uses the same intercept.

## Alternatives considered

**`file:` in the preview guest.** Rejected: `file:` stays cancelled; workspace HTML still uses the token listener.

**Harness-origin `/f/` or any same-origin file HTTP.** Rejected: same `/api` leak recorded in [opening a produced file from the web UI](2026-07-31-web-workspace-file-links.md).

**An unprefixed listener on a high port.** Rejected: any local process can scan and read the cwd.

**Changing the Markdown renderer to emit `file:` or an in-app protocol.** Rejected: conversation already has `openPath` and `target="_blank"`; the interceptor and window guards are the join points.

**Dual-open from the Files tree.** Deferred: the tree remains a source editor; conversation, chips, tool rows, and terminal paths go through `openPath`.

## Consequences

`dsh web` still uses Host `openPath` / the OS browser. Desktop conversation HTML/SVG and non-harness loopback stay in the right column. Remote http(s) still leave the app. Same-origin `_blank` cannot load the Harness UI into the preview partition. Boot windows never receive `shell:open-preview-url`.

## Testing

`src/main/preview-workspace.test.js` pins token-prefix 200 + nosniff, no-token 404, `../` and `%2e%2e%2f` 404, directory refuse + GET 403, POST 405, bad Host, unauthorized cwd, close → ECONNREFUSED, and an escaping symlink not served. `src/main/preview.test.js` pins `shell:preview-workspace-file` and closeAll shutting that server. `src/preload/shell-api.test.js` pins `previewWorkspaceFile` and `onOpenPreviewUrl`. `ui-surfaces` `openpath-intercept.client.spec.ts` pins awaiting an async `openInSurfaces`. `apply.client.spec.ts` pins html dual-open after Files, `.ts` / extensionless not previewing, missing or refusing or throwing IPC leaving Files without throwing, and `onOpenPreviewUrl` forwarding (including sessionStorage quota). `src/main/window-nav.test.js` pins boot-style loopback popups still `openExternal`, cross-port loopback popup/denied navigate sending `shell:open-preview-url` on that contents, harness-origin popup neither, remote still `openExternal`, `file:` neither, and `will-redirect` deny-only.

## Related

[Opening a produced file from the web UI](2026-07-31-web-workspace-file-links.md) owns `dsh web` Host `openPath`. [Right-panel and terminal work loops](2026-08-16-surfaces-terminal-work-loops.md) owns the Files/Browser/Terminal loops this intercept joins.
