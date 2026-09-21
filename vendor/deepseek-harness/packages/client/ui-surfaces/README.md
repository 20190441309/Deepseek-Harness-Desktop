# @deepseek-ai/dsh-client-ui-surfaces

English | [中文](README.zh.md)

Right-panel shell: occupies the layout `surfaces` column (`single`, `session-maybe`). The tab strip stays mounted as titlebar chrome even when empty (no + until a surface is open); each tab’s close control is to the right of the title. The 2×N empty-state card grid (Browser / Terminal / Files / Diff / Agents) fills the body until a surface is open. A card calls `open(kind)` on `createSurfacesStore()` and `layout.openSurfaces()`. With surfaces present, the shell keeps every open occupant mounted and hides inactive ones so Browser history and unsaved Files drafts survive tab switches. Dirty file drafts persist in localStorage with the tab list so reload and quit restore them. Contract: the [slot system standard](../../../.agents/notes/implemented/architecture/2026-07-22-slot-type-chain-implementation.md).

The store keys descriptors by `sessionId` (`bySession`). `open` upserts singleton files/diff/agents, one preview, and one terminal placeholder. `openFile` keeps the files explorer and adds a sibling `file:` tab. `activate` / `close` / `closeOthers` / `closeToRight` / `closeAll` edit that session's list. Titlebar `toggleSurfaces` writes only layout width and does not clear this store. When the pinned Workspace Controller lacks `openPath`, ui-surfaces installs a Host-RPC-backed base method before wrapping it. On desktop, the wrapper takes paths inside the originating Session cwd (an explicit Chat `sessionId`, otherwise the retained main-view Session) and prefers the mounted right Sidebar: the root opens its Files page, ordinary files open through `sidebarRight.openResourceIn(sessionId, fileAddressFor(...))` with a line carried as `{ params: { line } }`, and `.html`, `.htm`, `.xhtml`, and `.pdf` keep that file resource before awaiting `previewWorkspaceFile` and opening the token URL in the Sidebar Browser. The legacy surfaces column is used only when the Sidebar service is absent, or when the target Session has neither an adopted store nor a matching live binding: the root opens its Files explorer, other paths open a `file:` tab, and browser documents activate Browser after Files. Once a Sidebar target is selected, a navigation exception propagates instead of silently changing route. SVG and other image, media, text, and source files remain in Files. Missing or failed preview IPC does not fall through to the OS opener; missing legacy occupants throw, and non-desktop or out-of-workspace paths use the base Host operation.

Declared children are all `single` + `session-maybe`: `surfaces.browser` (owner `active` and `occluded`), `surfaces.terminal`, `surfaces.files`, `surfaces.file`, `surfaces.diff`, `surfaces.agents`. `surfaces.terminal` matches the ui-user-terminal inject so the existing Terminal occupant attaches. `surfaces.files` owner is `openFile(relativePath)`; `surfaces.file` owner is `relativePath`, `active`, dirty/save buffer callbacks. The Diff empty-state card is disabled when the current session has no cwd or `gitStatus(cwd)` is null. DiffPanel shows `Diff is only available in Git repositories.` when the cwd is not a Git repository. The Browser card is disabled when desktop `window.shell.previewOpen` is absent, with the reason `Browser previews are only available in the desktop app.` Surface menus and the unsaved-file dialog set `occluded` so the native BrowserView cannot receive clicks through renderer chrome. Occupant bodies are injected by later packages.

The `/client` exports are the plugin body (`apply`/`inject`), the store factory, and the contract types only; SurfacesRoot, EmptyState, and SurfaceTabs remain package-internal behind the slot registration.

## Model Experience

None, as the surfaces shell only owns viewing state and layout column geometry; nothing here reaches a model request.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- **Occupants are not implemented here** — Files, Diff, Browser, and Agents cards only `open(kind)` and `openSurfaces()`; later packages inject the slot bodies.

No runtime invariant companion is published; this package owns no independent durable event relationship, and focused package tests cover its UI or service behavior.
