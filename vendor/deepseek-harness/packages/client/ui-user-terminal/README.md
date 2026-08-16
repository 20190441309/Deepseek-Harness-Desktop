# @deepseek-ai/dsh-client-ui-user-terminal

English | [中文](README.zh.md)

User terminal: the conversation-column drawer (`shell.terminalDrawer`) and the right-panel Terminal surface (`surfaces.terminal`) each sit on their own `createTerminalSessionStore()` handle, so a pane opened in one shell does not appear in the other. Contract: the [slot system standard](../../../.agents/notes/implemented/architecture/2026-07-22-slot-type-chain-implementation.md).

The store keeps `sessions[]`, `activeId`, per-session `cols`/`rows`/`buffer`, and split groups capped at T3code `MAX_TERMINALS_PER_GROUP` (4). Desktop PTY IPC lives only on `window.shell` (`ptyCreate` / `ptyWrite` / `ptyResize` / `ptyKill` / `onPtyData` / `onPtyExit`); the renderer never loads Node. A missing project cwd does not create a PTY. Each pane is `@xterm/xterm` plus FitAddon; FitAddon owns PTY resize. The canvas theme is read from `--dsw-*` aliases on the host, and the canvas font is `--dsw-font-family-terminal` (then `--ds-font-family-code`). Windows PTY spawn is `powershell.exe -NoLogo -NoProfile`.

The drawer toolbar is horizontal split / vertical split / maximize (restore remembers the last height) / new / close. A session list appears when more than one PTY is open. A selection offers Copy, Add to chat (fenced `terminal` draft; disabled without a session id), and Open when the text is a URL or workspace path. ⌘/Ctrl-click activates the same targets. Loopback http(s) opens the Browser surface; other http(s) calls `window.shell.openExternal`. Workspace paths go through `workspaces.openPath` and drop `:line:column`. Height drag writes `setTerminalDrawer` clamped to `TERMINAL_DRAWER_MIN` ..= 75% of the viewport. Ctrl+` calls `toggleTerminalDrawer` when a cwd exists. `surfaces.terminal` is injected so it attaches when the surfaces shell declares that slot; that occupant has no separate maximize.

The `/client` exports are the plugin body (`apply`/`inject`), the store factory, and the contract types only; drawer and surface components remain package-internal behind the slot registrations.

## Model Experience

None, as the user terminal only drives desktop PTY IPC and layout geometry; nothing here reaches a model request.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- **Right-panel shell is not owned here** — this package injects `surfaces.terminal` and does not declare the surfaces column or its empty-state cards.
- **Maximize is the conversation drawer only** — `surfaces.terminal` has no separate maximize control.
- **No jump-to-line** — terminal file links strip `:line:column` because FilePreview has no revealLine.
