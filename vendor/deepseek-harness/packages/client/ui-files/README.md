# @deepseek-ai/dsh-client-ui-files

English | [中文](README.zh.md)

Right-panel Files occupant: a read-only workspace tree on `surfaces.files` and a single-file preview on `surfaces.file`. Both slots are `single` + `session-maybe`, declared by ui-surfaces. Clicking a file calls the owner `openFile(relativePath)` (T3code `openFile`). Contract: the [slot system standard](../../../.agents/notes/implemented/architecture/2026-07-22-slot-type-chain-implementation.md).

Workspace root is the current session `cwd` from one `useSessions` read. Listing and file bytes come from desktop `window.shell` `listDir` / `readFile`; the renderer never loads Node. Directories expand lazily.

The `/client` exports are the plugin body (`apply`/`inject`) plus the contract types only; FilesPanel, FilePreview, and FileTree remain package-internal behind the slot registration.

## Model Experience

None, as the Files surface only reads the workspace for display; nothing here reaches a model request.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- **The tree is read-only** — there is no create, rename, delete, or drag-to-mention.
- **Preview is plain text** — binary files show `preview.binary`; there is no image or markdown render mode.
