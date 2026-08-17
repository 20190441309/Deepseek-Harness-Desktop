# @deepseek-ai/dsh-client-ui-files

English | [中文](README.zh.md)

Right-panel Files occupant: a read-only workspace tree on `surfaces.files` and a single-file preview on `surfaces.file`. Both slots are `single` + `session-maybe`, declared by ui-surfaces. Clicking a file calls the owner `openFile(relativePath)`. Contract: the [slot system standard](../../../.agents/notes/implemented/architecture/2026-07-22-slot-type-chain-implementation.md).

Workspace root is the current session `cwd` from one `useSessions` read. Listing and file bytes come from desktop `window.shell` `listDir` / `readFile` / `readFileMedia` / `writeFile`; the renderer never loads Node. Directories expand lazily; the tree can be filtered by name (search walks are capped at depth 8 and 200 directories, and the panel reports when that budget stops the walk early). Refresh reloads the root listing; while a search is active it re-walks that search so nested matches are not dropped. Mention is a row `@` into the composer and is omitted without a session id; the context menu copies relative or absolute path. Images render as data URLs. Text that fits the read cap can be edited and saved; a failed save keeps the editor and the unsaved buffer and reports the error above it. FilePreview rereads when its tab becomes active. A dirty draft stays in the editor (Markdown Source included) when that reread fails, returns truncated or binary bytes, or runs without a cwd; Save writes whenever cwd exists, and a successful write clears truncated/binary. Save rereads disk and keeps the draft with `error.changed` when the file moved under the buffer; a second save overwrites. The surfaces shell persists dirty drafts in localStorage across reload and quit. `.md` toggles source versus `MarkdownText`.

The `/client` exports are the plugin body (`apply`/`inject`) plus the contract types only; FilesPanel, FilePreview, and FileTree remain package-internal behind the slot registration.

## Model Experience

None, as the Files surface only reads the workspace for display; nothing here reaches a model request.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- **The tree does not mutate the workspace** — there is no create, rename, or delete. Mention is the row `@` into the composer when a session id is present; there is no drag-from-tree. Text files that fit the read cap can be edited and saved.
- **No jump-to-line** — FilePreview opens the file; `:line:column` from the terminal is stripped.
