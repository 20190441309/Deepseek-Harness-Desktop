/**
 * Viewport fit policy shared by every xterm pane (drawer and surface).
 * Zero-size hosts and mid-layout PTY resizes are skipped so a collapsed
 * drawer or in-progress split never becomes a 1-row ConPTY.
 */

/** Second fit after mount, once CSS grid/flex has a used box. */
export const FIT_SETTLE_MS = 30

/**
 * Delay before `ptyResize`. FitAddon updates the local grid immediately;
 * notifying the PTY on every split step makes PowerShell reprint the prompt
 * against a 1-row / 2-col ConPTY.
 */
export const PTY_RESIZE_DEBOUNCE_MS = 150

/**
 * Whether FitAddon can measure this host. A 0×0 box (collapsed drawer, grid
 * cell not yet laid out) must not become a PTY resize.
 * @param el - the xterm host element.
 * @returns true when both axes have a used CSS box.
 */
export function hostHasFitSize(el: HTMLElement): boolean {
  return el.clientWidth > 0 && el.clientHeight > 0
}
