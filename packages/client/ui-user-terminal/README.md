# @deepseek-ai/dsh-client-ui-user-terminal

English | [中文](README.zh.md)

Shared user terminal: the conversation-column drawer (`shell.terminalDrawer`) and the right-panel Terminal surface (`surfaces.terminal`) sit on one `createTerminalSessionStore()` handle so `activate(id)` reads the same session record from either shell. Contract: the [slot system standard](../../../.agents/notes/implemented/architecture/2026-07-22-slot-type-chain-implementation.md).

The store keeps `sessions[]`, `activeId`, per-session `cols`/`rows`/`buffer`, and split groups capped at T3code `MAX_TERMINALS_PER_GROUP` (4). Desktop PTY IPC lives only on `window.shell` (`ptyCreate` / `ptyWrite` / `ptyResize` / `ptyKill` / `onPtyData` / `onPtyExit`); the renderer never loads Node. A missing project cwd does not create a PTY.

The drawer toolbar is split / maximize / new / close. Height drag writes `setTerminalDrawer` clamped to `TERMINAL_DRAWER_MIN` ..= 75% of the viewport. Ctrl+` calls `toggleTerminalDrawer` when a cwd exists. `surfaces.terminal` is injected so it attaches when the surfaces shell declares that slot.

The `/client` exports are the plugin body (`apply`/`inject`), the store factory, and the contract types only; drawer and surface components remain package-internal behind the slot registrations.

## Model Experience

None, as the user terminal only drives desktop PTY IPC and layout geometry; nothing here reaches a model request.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- **Interactive view is not a VT emulator** — panes are a focusable `div` plus `pre` that render the raw PTY byte stream and forward a small key set to `ptyWrite` (Enter, Backspace, Tab, printable keys, and Ctrl+C as `\x03`). There is no ANSI/VT parsing, no arrow/Home/End/Delete map, and no paste path. Plan Task 5 allowed this reduced view; `@xterm/xterm` is not integrated.
- **Right-panel shell is not owned here** — this package injects `surfaces.terminal` and does not declare the surfaces column or its empty-state cards.
