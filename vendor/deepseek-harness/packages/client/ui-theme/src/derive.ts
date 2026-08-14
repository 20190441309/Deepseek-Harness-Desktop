/** Seed-color derivation into `--dsw-alias-*` token overrides. */

import type { ThemeSeeds, ThemeTokens } from './theme-family.ts'

type Rgb = { r: number; g: number; b: number }

const STATUS_PALETTE = {
  light: {
    destructive: '#c53b2c',
    success: '#0a7d5d',
    warning: '#a95a00',
  },
  dark: {
    destructive: '#ff7b72',
    success: '#3fb950',
    warning: '#d29922',
  },
} as const

/**
 * Derive alias-layer tokens from three seed colors and contrast.
 * Incomplete coverage is intentional: unset names keep the CSS-sheet values.
 * @param seeds - accent / background / foreground plus optional overrides.
 * @returns `--dsw-*` variable map for the active half.
 */
export function deriveThemeTokens(seeds: ThemeSeeds): ThemeTokens {
  const contrastFactor = clamp(seeds.contrast / 100, 0, 1)
  const isDark = getRelativeLuminance(seeds.background) < getRelativeLuminance(seeds.foreground)
  const card = mixColors(
    seeds.background,
    seeds.foreground,
    isDark ? 0.02 + contrastFactor * 0.04 : 0.006 + contrastFactor * 0.016,
  )
  const overlay = mixColors(
    seeds.background,
    seeds.foreground,
    isDark ? 0.035 + contrastFactor * 0.05 : 0.012 + contrastFactor * 0.02,
  )
  const layer2 = mixColors(
    seeds.background,
    seeds.foreground,
    isDark ? 0.05 + contrastFactor * 0.05 : 0.02 + contrastFactor * 0.02,
  )
  const mutedForeground = mixColors(
    seeds.foreground,
    seeds.background,
    0.38 - contrastFactor * 0.14,
  )
  const border = withAlpha(seeds.foreground, 0.08 + contrastFactor * 0.18)
  const input = withAlpha(seeds.foreground, 0.1 + contrastFactor * 0.2)
  const sidebar = mixColors(
    seeds.background,
    seeds.foreground,
    isDark ? 0.055 + contrastFactor * 0.055 : 0.045 + contrastFactor * 0.05,
  )
  const status = isDark ? STATUS_PALETTE.dark : STATUS_PALETTE.light
  const tokens: ThemeTokens = {
    '--dsw-alias-bg-base': seeds.background,
    '--dsw-alias-bg-layer-1': card,
    '--dsw-alias-bg-layer-2': layer2,
    '--dsw-alias-bg-overlay': overlay,
    '--dsw-alias-label-primary': seeds.foreground,
    '--dsw-alias-label-secondary': mutedForeground,
    '--dsw-alias-brand-primary': seeds.accent,
    '--dsw-alias-border-l1': border,
    '--dsw-alias-border-l2': input,
    '--dsw-alias-state-error-primary': status.destructive,
    '--dsw-alias-state-success-primary': status.success,
    '--dsw-alias-state-warn-primary': status.warning,
    '--dsw-specific-sidebar-fill': sidebar,
  }
  if (seeds.overrides) {
    for (const [name, value] of Object.entries(seeds.overrides)) {
      if (value) tokens[name] = value
    }
  }
  return tokens
}

/**
 * Sort candidates by WCAG contrast against `background` and pick the winner.
 * @param background - surface the text sits on.
 * @param candidates - candidate text colors.
 * @returns the most readable candidate.
 */
export function pickReadableText(background: string, candidates: readonly string[]): string {
  return candidates.toSorted(
    (left, right) => getContrastRatio(background, right) - getContrastRatio(background, left),
  )[0] ?? candidates[0]!
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function parseHexColor(hex: string): Rgb {
  const normalized = hex.replace('#', '')
  const expanded = normalized.length === 8 ? normalized.slice(0, 6) : normalized
  return {
    r: Number.parseInt(expanded.slice(0, 2), 16),
    g: Number.parseInt(expanded.slice(2, 4), 16),
    b: Number.parseInt(expanded.slice(4, 6), 16),
  }
}

function toHexColor({ r, g, b }: Rgb): string {
  const channel = (value: number) => Math.round(clamp(value, 0, 255)).toString(16).padStart(2, '0')
  return `#${channel(r)}${channel(g)}${channel(b)}`
}

function mixColors(left: string, right: string, ratio: number): string {
  const from = parseHexColor(left)
  const to = parseHexColor(right)
  const amount = clamp(ratio, 0, 1)
  return toHexColor({
    r: from.r + (to.r - from.r) * amount,
    g: from.g + (to.g - from.g) * amount,
    b: from.b + (to.b - from.b) * amount,
  })
}

function withAlpha(color: string, alpha: number): string {
  const { r, g, b } = parseHexColor(color)
  return `rgb(${r} ${g} ${b} / ${clamp(alpha, 0, 1).toFixed(3)})`
}

function transformGammaChannel(channel: number): number {
  const normalized = channel / 255
  return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4
}

function getRelativeLuminance(color: string): number {
  const { r, g, b } = parseHexColor(color)
  return 0.2126 * transformGammaChannel(r) + 0.7152 * transformGammaChannel(g) + 0.0722 * transformGammaChannel(b)
}

function getContrastRatio(left: string, right: string): number {
  const leftLuminance = getRelativeLuminance(left)
  const rightLuminance = getRelativeLuminance(right)
  const lighter = Math.max(leftLuminance, rightLuminance)
  const darker = Math.min(leftLuminance, rightLuminance)
  return (lighter + 0.05) / (darker + 0.05)
}
