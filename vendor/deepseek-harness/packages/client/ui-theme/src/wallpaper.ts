/** Wallpaper extras: data-URL validation, encode, and surface mixing. */

import type { ThemeTokens } from './theme-family.ts'

/** Wallpaper blur / pixelate slider bounds (percent, integer). */
export const MIN_WALLPAPER_EFFECT = 0
export const MAX_WALLPAPER_EFFECT = 100
export const DEFAULT_WALLPAPER_EFFECT = 0
export const WALLPAPER_EFFECT_STEP = 1

/** Longest data URL accepted in the Host section (keeps settings.yaml bounded). */
export const MAX_WALLPAPER_DATA_URL_CHARS = 1_800_000

/** Longest source edge kept when encoding a picked file. */
export const MAX_WALLPAPER_EDGE = 1920

/** How solid chrome stays when a wallpaper is showing (percent of the solid fill). */
export const WALLPAPER_SURFACE_SOLIDITY = 58

/** Fixed layer that paints the wallpaper behind `#root`. */
export const WALLPAPER_LAYER_ID = 'dsh-wallpaper'

/** Inner node that carries cover + pixel scale + blur. */
export const WALLPAPER_INNER_ID = 'dsh-wallpaper-inner'

/** Root attribute flipped on while a wallpaper is live. */
export const WALLPAPER_ATTR = 'data-dsh-wallpaper'

const ALLOWED_TYPES = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif'])

const DATA_URL = /^data:image\/(?:png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=\s]+$/i

/**
 * Clamp a wallpaper effect percent into the slider range.
 * @param value - raw slider or Host number.
 * @returns an integer 0–100.
 */
export function clampWallpaperEffect(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_WALLPAPER_EFFECT
  return Math.min(MAX_WALLPAPER_EFFECT, Math.max(MIN_WALLPAPER_EFFECT, Math.round(value)))
}

/**
 * Map the blur slider to a CSS blur radius.
 * @param percent - 0–100.
 * @returns pixels, 0–40.
 */
export function wallpaperBlurPx(percent: number): number {
  return (clampWallpaperEffect(percent) / MAX_WALLPAPER_EFFECT) * 40
}

/**
 * Map the pixelate slider to a CSS scale factor. 0 stays 1 (no pixelation).
 * @param percent - 0–100.
 * @returns a scale ≥ 1.
 */
export function wallpaperPixelFactor(percent: number): number {
  const clamped = clampWallpaperEffect(percent)
  return clamped <= 0 ? 1 : 1 + (clamped / MAX_WALLPAPER_EFFECT) * 19
}

/**
 * Accept only raster image data URLs that fit the Host size cap.
 * @param value - candidate stored string.
 * @returns whether the value may be painted as a wallpaper.
 */
export function isWallpaperDataUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0) return false
  if (value.length > MAX_WALLPAPER_DATA_URL_CHARS) return false
  return DATA_URL.test(value)
}

/**
 * Read a File as a data URL.
 * @param file - picked image.
 * @returns the FileReader data URL.
 */
export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      resolve(typeof reader.result === 'string' ? reader.result : '')
    }
    reader.onerror = () => {
      reject(reader.error ?? new Error('read failed'))
    }
    reader.readAsDataURL(file)
  })
}

/**
 * Downscale a data URL onto a JPEG canvas. Returns null when Image/canvas
 * cannot decode (jsdom) so the caller can keep the original.
 * @param dataUrl - already-validated raster data URL.
 * @returns a JPEG data URL, or null.
 */
export function downscaleWallpaper(dataUrl: string): Promise<string | null> {
  return new Promise((resolve) => {
    if (typeof Image === 'undefined' || typeof document === 'undefined') {
      resolve(null)
      return
    }
    const image = new Image()
    let settled = false
    const finish = (value: string | null): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      image.onload = null
      image.onerror = null
      resolve(value)
    }
    const timer = setTimeout(() => { finish(null) }, 200)
    const paint = (): void => {
      const width = image.naturalWidth || image.width
      const height = image.naturalHeight || image.height
      if (!width || !height) {
        finish(null)
        return
      }
      const scale = Math.min(1, MAX_WALLPAPER_EDGE / Math.max(width, height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(width * scale))
      canvas.height = Math.max(1, Math.round(height * scale))
      const context = canvas.getContext('2d')
      if (context === null) {
        finish(null)
        return
      }
      context.drawImage(image, 0, 0, canvas.width, canvas.height)
      try {
        const jpeg = canvas.toDataURL('image/jpeg', 0.82)
        finish(isWallpaperDataUrl(jpeg) ? jpeg : null)
      } catch {
        finish(null)
      }
    }
    image.onload = paint
    image.onerror = () => { finish(null) }
    image.src = dataUrl
    if (image.complete) paint()
  })
}

/**
 * Encode a user-picked image into a persistable wallpaper data URL.
 * @param file - image file from the file picker.
 * @returns a data URL, or null when the file is not a usable wallpaper.
 */
export async function encodeWallpaperFile(file: File): Promise<string | null> {
  const named = /\.(png|jpe?g|webp|gif)$/i.test(file.name)
  if (!ALLOWED_TYPES.has(file.type) && !named) return null
  let raw: string
  try {
    raw = await readFileAsDataUrl(file)
  } catch {
    return null
  }
  if (!raw.startsWith('data:image/')) return null
  const resized = await downscaleWallpaper(raw)
  const next = resized ?? (isWallpaperDataUrl(raw) ? raw : null)
  if (next === null || next.length > MAX_WALLPAPER_DATA_URL_CHARS) return null
  return next
}

/**
 * Make the main chrome fills translucent so a wallpaper can show through.
 * @param tokens - current alias tokens (may be empty for DeepSeek).
 * @param mode - resolved half, picks the sheet fallbacks.
 * @returns a new token dictionary.
 */
export function mixWallpaperSurfaces(tokens: ThemeTokens, mode: 'light' | 'dark'): ThemeTokens {
  const next: ThemeTokens = { ...tokens }
  const base = mode === 'dark'
    ? 'var(--dsw-static-neutral-bluish-950)'
    : 'var(--dsw-static-neutral-bluish-00)'
  const raised = mode === 'dark'
    ? 'var(--dsw-static-neutral-bluish-875)'
    : 'var(--dsw-static-neutral-bluish-00)'
  const fallbacks: Record<string, string> = {
    '--dsw-alias-bg-base': base,
    '--dsw-alias-bg-layer-1': raised,
    '--dsw-alias-bg-layer-2': raised,
    '--dsw-specific-sidebar-fill': raised,
  }
  for (const [name, fallback] of Object.entries(fallbacks)) {
    const current = next[name]
    const solid = current !== undefined && !current.includes('color-mix') ? current : fallback
    next[name] = `color-mix(in srgb, ${solid} ${WALLPAPER_SURFACE_SOLIDITY}%, transparent)`
  }
  return next
}

/**
 * Paint or remove the fixed wallpaper layer. Safe when `document` is missing.
 * @param extras - stored image plus the two effect sliders.
 */
export function applyWallpaperLayer(extras: {
  wallpaperImage: string
  wallpaperBlur: number
  wallpaperPixelate: number
}): void {
  if (typeof document === 'undefined') return
  const image = isWallpaperDataUrl(extras.wallpaperImage) ? extras.wallpaperImage : ''
  const root = document.documentElement
  if (image.length === 0) {
    root.removeAttribute(WALLPAPER_ATTR)
    document.getElementById(WALLPAPER_LAYER_ID)?.remove()
    root.style.removeProperty('--dsh-wallpaper-image')
    root.style.removeProperty('--dsh-wallpaper-blur')
    root.style.removeProperty('--dsh-wallpaper-pixel')
    return
  }
  root.setAttribute(WALLPAPER_ATTR, '')
  let layer = document.getElementById(WALLPAPER_LAYER_ID)
  if (layer === null) {
    layer = document.createElement('div')
    layer.id = WALLPAPER_LAYER_ID
    layer.setAttribute('aria-hidden', 'true')
    const inner = document.createElement('div')
    inner.id = WALLPAPER_INNER_ID
    layer.appendChild(inner)
    document.body.insertBefore(layer, document.body.firstChild)
  }
  root.style.setProperty('--dsh-wallpaper-image', `url("${image}")`)
  root.style.setProperty('--dsh-wallpaper-blur', `${wallpaperBlurPx(extras.wallpaperBlur)}px`)
  root.style.setProperty('--dsh-wallpaper-pixel', String(wallpaperPixelFactor(extras.wallpaperPixelate)))
}
