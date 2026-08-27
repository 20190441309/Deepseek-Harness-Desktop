// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import {
  appearanceFontStack, applyAppearanceDocumentExtras, cssFontFamilies, quoteFontFamilyName,
} from '../src/appearance-apply.ts'
import { TRANSPARENT_ATTR, WALLPAPER_ATTR, WALLPAPER_LAYER_ID } from '../src/wallpaper.ts'

afterEach(() => {
  document.documentElement.style.fontSize = ''
  document.documentElement.style.removeProperty('--dsw-font-family')
  document.documentElement.style.removeProperty('--ds-font-family-code')
  document.documentElement.style.removeProperty('--dsw-font-size-code')
  document.documentElement.style.removeProperty('--dsw-font-family-composer')
  document.documentElement.style.removeProperty('--dsw-font-family-terminal')
})

describe('font stack helpers', () => {
  it('quotes family names that are not CSS idents', () => {
    expect(quoteFontFamilyName('Inter')).toBe('Inter')
    expect(quoteFontFamilyName('Source Han Sans')).toBe('"Source Han Sans"')
    expect(quoteFontFamilyName('"Already"')).toBe('"Already"')
    expect(quoteFontFamilyName('  ')).toBe('')
  })

  it('turns a comma list into a CSS family list or null', () => {
    expect(cssFontFamilies('')).toBeNull()
    expect(cssFontFamilies('Inter, Source Han Sans')).toBe('Inter, "Source Han Sans"')
  })

  it('prepends a custom list to the product default stack', () => {
    expect(appearanceFontStack('', 'Arial')).toBe('Arial')
    expect(appearanceFontStack('Inter', 'Arial')).toBe('Inter, Arial')
  })
})

describe('applyAppearanceDocumentExtras', () => {
  it('writes size and family extras onto the document root', () => {
    applyAppearanceDocumentExtras({
      fontFamilySans: 'Inter',
      fontFamilyCode: 'JetBrains Mono',
      fontSizeInterface: 18,
      fontSizeCode: 14,
      fontFamilyComposer: 'Georgia',
      fontFamilyTerminal: 'IBM Plex Mono',
    })
    expect(document.documentElement.style.fontSize).toBe('18px')
    expect(document.documentElement.style.getPropertyValue('--dsw-font-family')).toContain('Inter')
    expect(document.documentElement.style.getPropertyValue('--ds-font-family-code')).toContain('JetBrains Mono')
    expect(document.documentElement.style.getPropertyValue('--dsw-font-size-code')).toBe('14px')
    expect(document.documentElement.style.getPropertyValue('--dsw-font-family-composer')).toContain('Georgia')
    expect(document.documentElement.style.getPropertyValue('--dsw-font-family-terminal')).toContain('IBM Plex Mono')
  })

  it('falls back to product defaults when sizes are zero', () => {
    applyAppearanceDocumentExtras({
      fontFamilySans: '',
      fontFamilyCode: '',
      fontSizeInterface: 0,
      fontSizeCode: 0,
    })
    expect(document.documentElement.style.fontSize).toBe('16px')
    expect(document.documentElement.style.getPropertyValue('--dsw-font-size-code')).toBe('13px')
  })

  it('paints and clears the wallpaper layer from appearance extras', () => {
    const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
    applyAppearanceDocumentExtras({
      fontFamilySans: '',
      fontFamilyCode: '',
      fontSizeInterface: 16,
      fontSizeCode: 13,
      wallpaperImage: png,
      wallpaperBlur: 50,
      wallpaperPixelate: 25,
    })
    expect(document.documentElement.hasAttribute(WALLPAPER_ATTR)).toBe(true)
    expect(document.getElementById(WALLPAPER_LAYER_ID)).not.toBeNull()
    expect(document.documentElement.style.getPropertyValue('--dsh-wallpaper-blur')).toBe('20px')
    applyAppearanceDocumentExtras({
      fontFamilySans: '',
      fontFamilyCode: '',
      fontSizeInterface: 16,
      fontSizeCode: 13,
    })
    expect(document.documentElement.hasAttribute(WALLPAPER_ATTR)).toBe(false)
    expect(document.getElementById(WALLPAPER_LAYER_ID)).toBeNull()
  })

  it('flips the transparent-theme attribute only while a wallpaper is live', () => {
    const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
    const base = { fontFamilySans: '', fontFamilyCode: '', fontSizeInterface: 16, fontSizeCode: 13 }
    // Flag on without a wallpaper: the attribute stays off.
    applyAppearanceDocumentExtras({ ...base, transparentTheme: true })
    expect(document.documentElement.hasAttribute(TRANSPARENT_ATTR)).toBe(false)
    // Flag plus wallpaper: the attribute lands.
    applyAppearanceDocumentExtras({ ...base, transparentTheme: true, wallpaperImage: png })
    expect(document.documentElement.hasAttribute(TRANSPARENT_ATTR)).toBe(true)
    // Flag off clears it again.
    applyAppearanceDocumentExtras({ ...base, transparentTheme: false, wallpaperImage: png })
    expect(document.documentElement.hasAttribute(TRANSPARENT_ATTR)).toBe(false)
    applyAppearanceDocumentExtras(base)
  })
})
