/** Document extras the presenter does not own: root font-size and family stacks. */

import {
  DEFAULT_CODE_FONT_SIZE,
  DEFAULT_INTERFACE_FONT_SIZE,
} from './theme-family.ts'
import { TRANSPARENT_ATTR, applyWallpaperLayer, isWallpaperDataUrl } from './wallpaper.ts'

const DEFAULT_SANS_STACK = "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Helvetica Neue', Helvetica, Arial, sans-serif"
const DEFAULT_CODE_STACK = "'SF Mono', 'JetBrains Mono', 'Fira Code', Consolas, 'Liberation Mono', Menlo, Courier, 'PingFang SC', 'Microsoft YaHei'"

/**
 * Quote a user-entered family name when it is not a bare CSS ident.
 * @param name - one family token.
 * @returns a safe CSS family token.
 */
export function quoteFontFamilyName(name: string): string {
  const bare = name.trim()
  if (bare.length === 0) return ''
  if (/^(['"]).*\1$/.test(bare)) return bare
  if (/^[a-zA-Z][a-zA-Z0-9-]*$/.test(bare)) return bare
  return `"${bare.replaceAll('"', '')}"`
}

/**
 * Turn a user font preference into a CSS font-family list, or null when empty.
 * @param input - one name or a comma-separated list.
 * @returns a CSS list, or null.
 */
export function cssFontFamilies(input: string): string | null {
  const families = input.split(',').map(quoteFontFamilyName).filter(name => name.length > 0)
  return families.length > 0 ? families.join(', ') : null
}

/**
 * Prepend a custom family list to the product default stack.
 * @param custom - user preference.
 * @param defaultStack - sheet default.
 * @returns the resolved stack.
 */
export function appearanceFontStack(custom: string, defaultStack: string): string {
  const families = cssFontFamilies(custom)
  return families === null ? defaultStack : `${families}, ${defaultStack}`
}

/** Font and size extras applied on the document root. */
export interface AppearanceDocumentExtras {
  /** Interface font preference. */
  fontFamilySans: string
  /** Monospace font preference. */
  fontFamilyCode: string
  /** Root font size in px. */
  fontSizeInterface: number
  /** Code font size in px (published as a custom property). */
  fontSizeCode: number
  /** Composer font preference. */
  fontFamilyComposer?: string
  /** Terminal font preference. */
  fontFamilyTerminal?: string
  /** Wallpaper data URL; empty clears the layer. */
  wallpaperImage?: string
  /** Frosted-glass blur percent. */
  wallpaperBlur?: number
  /** Pixelation percent. */
  wallpaperPixelate?: number
  /** Transparent theme flag; effective only while a wallpaper is live. */
  transparentTheme?: boolean
}

/**
 * Write typography extras onto `documentElement`. Safe in non-browser tests.
 * @param extras - current appearance extras.
 */
export function applyAppearanceDocumentExtras(extras: AppearanceDocumentExtras): void {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  root.style.fontSize = `${extras.fontSizeInterface || DEFAULT_INTERFACE_FONT_SIZE}px`
  const sans = appearanceFontStack(extras.fontFamilySans, DEFAULT_SANS_STACK)
  const code = appearanceFontStack(extras.fontFamilyCode, DEFAULT_CODE_STACK)
  root.style.setProperty('--dsw-font-family', sans)
  root.style.setProperty('--ds-font-family-code', code)
  root.style.setProperty('--dsw-font-size-code', `${extras.fontSizeCode || DEFAULT_CODE_FONT_SIZE}px`)
  root.style.setProperty(
    '--dsw-font-family-composer',
    appearanceFontStack(extras.fontFamilyComposer ?? '', sans),
  )
  root.style.setProperty(
    '--dsw-font-family-terminal',
    appearanceFontStack(extras.fontFamilyTerminal ?? '', code),
  )
  applyWallpaperLayer({
    wallpaperImage: extras.wallpaperImage ?? '',
    wallpaperBlur: extras.wallpaperBlur ?? 0,
    wallpaperPixelate: extras.wallpaperPixelate ?? 0,
  })
  root.toggleAttribute(
    TRANSPARENT_ATTR,
    extras.transparentTheme === true && isWallpaperDataUrl(extras.wallpaperImage ?? ''),
  )
}
