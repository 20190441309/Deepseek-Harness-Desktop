# Agent Note: Terminal panes are opaque canvas wells

Status: implemented

English | [中文](2026-08-19-terminal-pane-opaque-tui-stage.zh.md)

## Problem

CodeBuddy's slash menu marks the selected row with Ink `bold` plus `colors.info` and `showIndicator: false` — no inverse, no cell background, no `>` prefix. Desktop panes sat those glyphs on an alpha-0 xterm fill over 12% wallpaper frost, so info versus secondary washed out and selection was indistinguishable. A client-side overlay that guessed the row from regexes and a local arrow index painted the wrong bar. `minimumContrastRatio` against an alpha-0 canvas RGB made letters readable without creating a selected row.

## Decision

The PTY well is opaque. `--dsw-alias-terminal-pane` is `var(--dsw-alias-bg-base)` on the design sheet; `mixWallpaperSurfaces` keeps it the opaque canvas fallback (`--dsw-static-neutral-bluish-00` light, `--dsw-static-neutral-bluish-950` dark) or a family's solid `--dsw-alias-bg-base`, never a `color-mix` against transparent. `.paneTerminal` paints that token and has no `backdrop-filter`. `readXtermTheme` sets `theme.background` to the canvas RGB with no alpha. `TerminalPane` constructs xterm with `allowTransparency: false` so xterm does not replace a translucent fill with `#000000`. Wallpaper still mixes the chat canvas and sidebar; the terminal well does not participate. The pane still does not restyle `.xterm-bold` or paint a guessed selection bar. Inverse-video cells keep the `.xterm-bg-257` / `.xterm-fg-257` token overrides. `minimumContrastRatio` is 1; ANSI cyan/blue are Pierre, owned by [PTY ANSI colors follow T3code Pierre, not UI state tokens](2026-08-19-terminal-ansi-pierre-palette.md).

## Alternatives considered

**Keep wallpaper glass and paint an adaptive hover wash on a guessed row.** Rejected: the wash color is controllable, but the row is not; a local arrow index desynchronizes from the TUI, and SGR scraping misfires on ordinary output.

**Thicken the 12% frost until bold-plus-info reads.** Rejected: that still leaves a translucent photo behind the glyphs and trades wallpaper globally for one menu.

**Leave cells alpha-0 and rely on `minimumContrastRatio` alone.** Rejected: contrast against canvas RGB does not reconstruct a selected row when the TUI never paints a background.

**Fill the pane with `--dsw-alias-bg-layer-2`.** Rejected: layer-2 is the raised dialog token; the well follows the canvas family, not a stacked dialog.

## Consequences

Wallpaper no longer shows through the conversation-column drawer or the right-panel Terminal occupant. CodeBuddy's native bold-plus-info highlight sits on a light well in light theme and a dark well in dark theme, so selection is the TUI's own SGR. Chat, sidebar, and raised chrome keep the glass slider. Inverse cells remain the info-fill override rather than a swapped default background.

## Testing

`readXtermTheme` pins an opaque `rgb(...)` `theme.background` from `--dsw-alias-bg-base` (including `color-mix` and `color(srgb …)` tokens). The drawer spec pins `allowTransparency: false` and `.paneTerminal` background `--dsw-alias-terminal-pane` with no `backdrop-filter`. `mixWallpaperSurfaces` pins a light well to `var(--dsw-static-neutral-bluish-00)` and a custom hex canvas to that hex. `theme.client.spec.ts` pins the wallpaper mix to those opaque pane values. `wallpaper.css` has no `--dsw-terminal-pane-blur`.

## Related

[Terminal canvas uses the app background](2026-08-18-terminal-canvas-app-background.md) owns the transparent workspace root, wallpaper mask, and the rule that nested chrome does not restack `--dsw-alias-bg-base` on the chat canvas. [Terminal panes render TUIs verbatim with minimum contrast](2026-08-19-terminal-verbatim-tui-contrast-and-follow.md) owns the deleted row painter and inverse-cell CSS. [PTY ANSI colors follow T3code Pierre, not UI state tokens](2026-08-19-terminal-ansi-pierre-palette.md) owns ANSI 1–15 and `minimumContrastRatio`.
