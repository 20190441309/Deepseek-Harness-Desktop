# @deepseek-ai/dsh-client-ui-surfaces

English | [中文](README.zh.md)

Right-panel shell: occupies the layout `surfaces` column (`single`, `session-maybe`) and shows a 2×N empty-state card grid (Browser / Terminal / Files / Diff / Agents) until a surface is open. A card calls `open(kind)` on `createSurfacesStore()` and `layout.openSurfaces()`. With surfaces present, the shell renders tabs plus the active occupant. Contract: the [slot system standard](../../../.agents/notes/implemented/architecture/2026-07-22-slot-type-chain-implementation.md).

The store keys descriptors by `sessionId` (`bySession`). `open` upserts singleton files/diff/agents, one preview, and one terminal placeholder. `activate` / `close` / `closeOthers` / `closeToRight` / `closeAll` edit that session's list. Titlebar `toggleSurfaces` writes only layout width and does not clear this store.

Declared children are all `single` + `session-maybe`: `surfaces.browser`, `surfaces.terminal`, `surfaces.files`, `surfaces.diff`, `surfaces.agents`. `surfaces.terminal` matches the ui-user-terminal inject so the existing Terminal occupant attaches. Files / Diff / Browser / Agents occupants are later packages; this shell does not render their content.

The `/client` exports are the plugin body (`apply`/`inject`), the store factory, and the contract types only; SurfacesRoot, EmptyState, and SurfaceTabs remain package-internal behind the slot registration.

## Model Experience

None, as the surfaces shell only owns viewing state and layout column geometry; nothing here reaches a model request.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- **Occupants are not implemented here** — Files, Diff, Browser, and Agents cards only `open(kind)` and `openSurfaces()`; later packages inject the slot bodies.
- **File surfaces have no empty-state card** — `open` does not accept `file`; a later Files occupant opens `file:` descriptors.
