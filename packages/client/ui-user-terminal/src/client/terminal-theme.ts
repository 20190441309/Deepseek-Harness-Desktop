import type { ITheme } from '@xterm/xterm'

function isPaintedColor(value: string): boolean {
  if (value === '' || value === 'transparent' || value === 'rgba(0, 0, 0, 0)') return false
  return value.startsWith('rgb') || value.startsWith('#') || value.startsWith('hsl') || value.startsWith('color')
}

function resolvedColor(el: HTMLElement, token: string, fallback: string): string {
  const probe = el.ownerDocument.createElement('span')
  probe.style.color = `var(${token})`
  el.appendChild(probe)
  const value = getComputedStyle(probe).color
  probe.remove()
  return isPaintedColor(value) ? value : fallback
}

/**
 * Build an xterm theme from the host's computed `--dsw-*` aliases so the
 * canvas matches light and dark sheets. Fallbacks exist for jsdom, where
 * custom properties do not resolve.
 * @param el - the pane host that already consumes alias background and color.
 * @returns an xterm `ITheme`.
 */
export function readXtermTheme(el: HTMLElement): ITheme {
  const styles = getComputedStyle(el)
  const background = isPaintedColor(styles.backgroundColor)
    ? styles.backgroundColor
    : resolvedColor(el, '--dsw-alias-bg-layer-2', 'rgb(255, 255, 255)')
  const foreground = isPaintedColor(styles.color)
    ? styles.color
    : resolvedColor(el, '--dsw-alias-label-primary', 'rgb(15, 17, 21)')
  const muted = resolvedColor(el, '--dsw-alias-label-secondary', foreground)
  const hover = resolvedColor(el, '--dsw-alias-interactive-bg-hover', muted)
  const red = resolvedColor(el, '--dsw-alias-state-error-primary', foreground)
  const green = resolvedColor(el, '--dsw-alias-state-success-primary', foreground)
  const yellow = resolvedColor(el, '--dsw-alias-state-warn-primary', foreground)
  const blue = resolvedColor(el, '--dsw-alias-state-business-primary', foreground)
  return {
    background,
    foreground,
    cursor: foreground,
    cursorAccent: background,
    selectionBackground: hover,
    selectionForeground: foreground,
    black: foreground,
    red,
    green,
    yellow,
    blue,
    magenta: resolvedColor(el, '--dsw-alias-state-error-secondary', red),
    cyan: resolvedColor(el, '--dsw-alias-state-success-secondary', green),
    white: muted,
    brightBlack: muted,
    brightRed: red,
    brightGreen: green,
    brightYellow: yellow,
    brightBlue: blue,
    brightMagenta: red,
    brightCyan: green,
    brightWhite: foreground,
  }
}
