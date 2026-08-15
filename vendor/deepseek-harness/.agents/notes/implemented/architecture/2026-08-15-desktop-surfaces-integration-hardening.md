# Agent Note: Desktop surfaces integration hardening

Status: implemented

[中文](2026-08-15-desktop-surfaces-integration-hardening.zh.md)

> Scope: production hardening applied while integrating the T3code-style
> titlebar / Git / terminal / right-panel surfaces branch into the desktop
> shell. The branch laid out the composition ([surfaces note](2026-08-14-desktop-surfaces-and-titlebar.md));
> this note records the defects that only a real desktop run exposed, and the
> trust / lifecycle / packaging decisions that make the feature safe to ship.

## Problem

The surfaces branch passed its unit and browser suites, but a real Electron
launch surfaced four gaps: session-scope stores never bound under
`session-maybe`, several slots were declared by more than one package, the
terminal was a raw buffer rather than a VT, and packaged first-run hung while
extracting the runtime archive. Desktop capabilities also accepted any
renderer-supplied `cwd`, so a marketplace plugin could drive `shell.gitPush` /
`shell.readFile` against arbitrary directories.

## Decisions

**Session-maybe stores bind to the empty key.** `standardKit` skipped the store
seat for `session-maybe` entries while no session was current, so
`SurfacesRoot` and the terminal workspace mounted before a session existed and
never received `useStore`. The renderer now resolves a `session-maybe` store
with the empty string as the scope key; the surfaces and terminal stores key
their own buckets by `sessionId ?? ''`, so the empty instance is correct until
a session resolves. (`packages/client/web-react/src/scoped-slots.tsx`)

**One package owns each slot.** The catalog gate rejects a slot declared in two
places. `ui-surfaces` owns the `surfaces.*` children and `ui-layout` owns
`shell.titlebar.trailing` / `shell.terminalDrawer`; occupants import those
owners' slot types instead of re-declaring the `SlotMap` keys.

**The terminal is a real VT.** The raw `<pre>` replay view was replaced with
`xterm` + `addon-fit` (`TerminalPane`); the store's replay buffer seeds and
backfills the terminal, live PTY bytes flow straight into it, and the fitted
geometry drives `ptyResize`. `@xterm/xterm` is a dependency of both
`ui-user-terminal` and `dsh-client-web` (which imports `xterm.css`).

**All filesystem-backed desktop IPC is workspace-scoped.** A single
`workspace-authority` module resolves the configured workspace root and rejects
any `cwd` outside it (`..`, absolute escapes, missing/non-directory targets).
`git.js`, `pty.js`, and `workspace-fs.js` all authorize through it; tests inject
a temporary root because `node:test` runs outside Electron.

**PTY and BrowserView tear down with the renderer.** `createPtyController` gains
`killAll()` and `createPreviewController` gains `closeAll()`; `registerIpc`
returns both controllers and the main process sweeps them on quit, harness
restart, and reload.

**The packaged runtime archive extracts with portable tar args.** GNU tar (Git
for Windows) treats a `C:` drive prefix on `-f` and `-C` as a remote host or
fails to open backslash paths, while Windows' bundled bsdtar rejects GNU's
`--force-local`. `harness-extract.js` and `after-pack.js` run tar from the
archive directory and spell both `-f` and `-C` as forward-slash relative paths,
the one form both implementations accept. `build.npmRebuild` is disabled so
electron-builder ships node-pty's N-API prebuild instead of invoking node-gyp
(which requires Visual Studio). A `DSH_SMOKE=1` launch probe exercises the real
Electron shell: assembled chrome, and a PTY create/write/kill round trip.

## Alternatives

**Keeping the raw buffer terminal.** It dropped arrows, Home/End, Delete, and
paste; an interactive shell was unusable. Full VT rendering is the shipped
contract.

**Re-declaring slot keys per occupant.** TypeScript merges the duplicates, but
the client-catalog gate cannot attribute documentation and fails the build. The
single-owner rule is the only form the catalog accepts.

**Letting the renderer pick the filesystem root.** A third-party plugin runs
with the renderer's privileges; trusting its `cwd` would let it commit, push,
or read files anywhere. The main process must resolve the workspace root.

**Recompiling node-pty with node-gyp.** Unnecessary: node-pty ships N-API
prebuilds that load in Electron unchanged. Forcing the rebuild both requires
Visual Studio and breaks the default prebuild path.

## Impact

The surfaces shell, terminal, and filesystem-backed controls now behave the
same in a packaged install as in a unit test. First run extracts the runtime
archive, then the terminal round-trips a shell and the titlebar renders its
cluster. Packaged smoke (`DSH_SMOKE=1`) is reproducible in CI on any Windows
runner with Git for Windows installed.

## Testing

`workspace-authority.test.js` pins root/subdirectory acceptance and `..` /
absolute / missing / file rejection. `pty.test.js` and `preview.test.js` pin
`killAll` / `closeAll` and the IPC controller hand-back. `terminal-drawer` mocks
xterm and asserts the write/data/resize wiring. Root `npm test` covers the
desktop main-process modules; `desktop-chrome.e2e.ts` pins the assembled
titlebar and five-card grid in the browser lane, and `DSH_SMOKE=1` pins the real
Electron run end to end.

## Related

[Slot system standard](2026-07-22-slot-type-chain-implementation.md) owns the
composition model. [Desktop surfaces and titlebar](2026-08-14-desktop-surfaces-and-titlebar.md)
owns the layout, titlebar cluster, and window-control inset.
