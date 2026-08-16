# Agent Note: Desktop surfaces column, titlebar trailing cluster, and window-control padding

Status: implemented

English | [中文](2026-08-14-desktop-surfaces-and-titlebar.zh.md)

> Scope: the shipped four-column AppFrame, the `shell.titlebar.trailing` list slot, desktop `git` / `pty` / `preview` IPC, and the measured window-control pad. The [slot system standard](2026-07-22-slot-type-chain-implementation.md) owns composition; the [web client architecture note](2026-07-19-gui-web-client-architecture.md) owns loading and the object layer. This note does not replace those decisions.

## Problem

The desktop shell needed T3code-style Git, a bottom terminal, and a far-right surfaces column without moving Inspect or rebuilding the left sidebar. A frameless window also has to keep that growing titlebar cluster clear of the painted minimize / maximize / close controls.

## Decision

AppFrame is four columns, `sidebar | conversation | details | surfaces`, plus a conversation-only terminal drawer. A shared titlebar row spans columns 2–4; the sidebar still spans full height with its logo row. Closed `details` and `surfaces` are width 0. Concession shrinks surfaces to its minimum, then details, then derived-closes surfaces, then details; the sidebar never concedes. `ctx.layout` writes surfaces and the drawer independently of details: titlebar toggles never open or close the details column, and closing one column does not close the other.

The titlebar cluster is the layout-owned list slot `shell.titlebar.trailing`, wrapped as `#dsh-shell-titlebar-trailing`. Contributors inject with [slot declaration injection](2026-08-05-slot-declaration-injection.md). Left to right: Session log (`id: 'session-log-download'`, `order: 10`), Git (`id: 'git-actions'`, `order: 20`), panel toggles (`id: 'panel-toggles'`, `order: 40`), then the Electron window controls. Toggles write only `toggleTerminalDrawer` and `toggleSurfaces`. Session log remains the same download control; it renders only while a Session is current.

Harness client plugins own the UI. Electron exposes `window.shell.git*`, `window.shell.pty*`, and `window.shell.preview*` only; the inject script does not paint Git, the terminal, or the right panel. The drawer and the Terminal surface share one PTY session family for the workspace cwd. The five surfaces are Browser, Terminal, Files, Diff, and Agents. Outside the desktop app, Git IPC no-ops and the Browser card is disabled.

`reservedRight()` is window-control width plus the measured `#dsh-shell-titlebar-trailing` width and one cluster gap, or controls only when that width is 0. The inject script publishes `--dsh-wco-pad` (full reserved inset) and `--dsh-wco-controls` (controls only). AppFrame has a shared titlebar grid row (`auto` + body + drawer). The conversation header and scroll body are subgrid items of that row pair (`ConversationRoot` is `display: contents`). Details and surfaces occupy the body row, so their hairlines and occupants start below the titlebar band rather than under Session log, Git, panel toggles, or window controls. The trailing cluster is a grid item of that titlebar row (`justify-self: end`, `margin-right: var(--dsh-wco-controls, var(--dsh-wco-pad))`), not an overlay on column content. Phone and compact-header frames hide the cluster; a closed column is width 0 with no hairline, so it does not leave a hole. The inject script is a re-runnable IIFE: a second `executeJavaScript` of the same file must not throw. Node-requireable helpers live in `src/main/harness-chrome-metrics.js`.

## Alternatives considered

**Paint Git, the terminal, or the right panel in `harness-chrome-inject.js`.** That file is evaluated twice (`dom-ready` then `did-finish-load`); top-level bindings throw and the catch paints the window white. Desktop chrome also has no slot, locale, or store seats.

**Replace the details column with surfaces, or let the titlebar toggles drive details.** Inspect, the trajectory TOOL inspector, and existing details open/close stay on `details`. A shared toggle would couple two independent columns.

**Copy T3code's Ghostty / Effect / zustand right-panel stack.** The client already composes through slots and `defineStore`. A second state stack would duplicate ownership and break the four-share props rule.

**Absolutely position the trailing cluster over the frame and inset surfaces with `margin-top`.** An overlay sits on empty-state cards and tab chrome; a 56px column spacer leaves a hole above the right column while conversation still has its own header. The titlebar row is the shared band; column content starts on the row below.

**Position the trailing cluster with `--dsh-wco-pad`.** The pad includes the cluster's own width, so the cluster would walk left on every measure. `--dsh-wco-controls` is the controls-only inset.

**Hard-code a trailing width instead of measuring `#dsh-shell-titlebar-trailing`.** Session log, Git, and the toggles change width with locale, status, and occupancy. A constant either overlaps the window controls or leaves a permanent hole.

## Consequences

The web composition and the desktop window share the same client plugins; Electron is an IPC host, not a second UI tree. Details and surfaces can be open or closed independently. Window-control padding tracks the live cluster, so adding a titlebar occupant does not require a new inset constant.

The inject script remains a closed chrome IIFE. Contributors that need a new titlebar control register into `shell.titlebar.trailing` with an `order` and keep Node helpers out of that file.

Desktop CI for this repository is the Electron installer workflow in `.github/workflows/release.yml` only. That workflow runs `npm ci` and packs the Windows installer; it does not run harness `test`, `test:gui`, `test:coverage`, `typecheck`, `lint`, or `doc-sync`. New client packages stay under the harness per-file 100% coverage gate locally, with `/* v8 ignore -- <reason> */` on genuinely unreachable arms.

The user terminal is a focusable raw-buffer view, not a VT emulator. Panes render the PTY byte stream in a `div` + `pre`, forward a small key set (including Ctrl+C as `\x03`), and do not parse ANSI. Plan Task 5 allowed this reduced interactive view; `@xterm/xterm` is not integrated.

## Testing

Package suites pin concession, store actions, titlebar inject/dispose, Git state, shared PTY ownership, and the five-card empty state. `src/main/harness-chrome-inject.test.js` pins the IIFE form, double-eval, and `--dsh-wco-pad` growth from a measured trailing width. `apps/web/tests/desktop-chrome.e2e.ts` is the keyless assembled assertion that the titlebar shows Session log, Git, and the two toggles, and that the right panel empty state shows the five cards.

## Related

The [web GUI browser e2e lane](../testing/2026-07-24-web-gui-browser-e2e-lane.md) owns snapshot mechanics. The [slot declaration injection decision](2026-08-05-slot-declaration-injection.md) owns contributor lifetimes on `shell.titlebar.trailing`.
