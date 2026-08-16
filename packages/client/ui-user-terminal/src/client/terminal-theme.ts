import type { ITheme } from '@xterm/xterm'

/** Monospace stack used when CSS terminal/code families do not resolve. */
export const FALLBACK_TERMINAL_FONT_FAMILY =
  "'SF Mono', 'JetBrains Mono', 'Fira Code', Consolas, 'Liberation Mono', Menlo, Courier"

/** Default canvas size when `--dsw-font-size-code` is absent. */
const DEFAULT_TERMINAL_FONT_SIZE = 13

/** xterm `lineHeight` multiplier (not a CSS px/em ratio). */
const TERMINAL_LINE_HEIGHT = 1.2

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

function isResolvedFontFamily(value: string): boolean {
  return value !== '' && !value.includes('var(')
}

function resolvedFontFamily(el: HTMLElement): string {
  const probe = el.ownerDocument.createElement('span')
  probe.style.fontFamily = 'var(--dsw-font-family-terminal, var(--ds-font-family-code))'
  el.appendChild(probe)
  const computed = getComputedStyle(probe).fontFamily.trim()
  probe.remove()
  if (isResolvedFontFamily(computed)) return computed
  const styles = getComputedStyle(el)
  const terminal = styles.getPropertyValue('--dsw-font-family-terminal').trim()
  if (isResolvedFontFamily(terminal)) return terminal
  const code = styles.getPropertyValue('--ds-font-family-code').trim()
  if (isResolvedFontFamily(code)) return code
  return FALLBACK_TERMINAL_FONT_FAMILY
}

function resolvedFontSize(el: HTMLElement): number {
  const raw = getComputedStyle(el).getPropertyValue('--dsw-font-size-code').trim()
  const parsed = Number.parseFloat(raw)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TERMINAL_FONT_SIZE
}

/** Canvas typeface, size, and line-height for one xterm instance. */
export type XtermFont = {
  fontFamily: string
  fontSize: number
  lineHeight: number
}

/**
 * Resolve xterm type metrics from the host. xterm's canvas does not parse
 * CSS variables, so `--dsw-font-family-terminal` (then `--ds-font-family-code`)
 * is read through a probe the same way `readXtermTheme` resolves colors.
 * `--dsw-font-size-code` is used when present; otherwise 13px. `lineHeight`
 * is the xterm multiplier 1.2.
 * @param el - the pane host that inherits appearance tokens.
 * @returns fontFamily, fontSize, and lineHeight for `new Terminal(...)`.
 */
export function readXtermFont(el: HTMLElement): XtermFont {
  return {
    fontFamily: resolvedFontFamily(el),
    fontSize: resolvedFontSize(el),
    lineHeight: TERMINAL_LINE_HEIGHT,
  }
}
