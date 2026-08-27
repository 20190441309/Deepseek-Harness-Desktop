/** Wallpaper extras: data-URL validation, encode, and surface mixing. */

import type { ThemeTokens } from './theme-family.ts'

/** Lowest wallpaper blur/pixelate the settings slider accepts (percent). */
export const MIN_WALLPAPER_EFFECT = 0
/** Highest wallpaper blur/pixelate the settings slider accepts (percent). */
export const MAX_WALLPAPER_EFFECT = 100
/** Default wallpaper blur/pixelate (percent). */
export const DEFAULT_WALLPAPER_EFFECT = 0
/** Wallpaper effect slider step (percent). */
export const WALLPAPER_EFFECT_STEP = 1

/** Longest data URL accepted in the Host section (keeps settings.yaml bounded). */
export const MAX_WALLPAPER_DATA_URL_CHARS = 1_800_000

/** Maximum local or proxied wallpaper file size before decoding. */
export const MAX_WALLPAPER_FILE_BYTES = 12 * 1024 * 1024

/** Longest source edge kept when encoding a picked file. */
export const MAX_WALLPAPER_EDGE = 1920

/** Fixed layer that paints the wallpaper behind `#root`. */
export const WALLPAPER_LAYER_ID = 'dsh-wallpaper'

/** Inner canvas that carries the cover-cropped (optionally pixelated) bitmap plus blur. */
export const WALLPAPER_INNER_ID = 'dsh-wallpaper-inner'

/** Bleed (px per side) around the viewport so blur has no bright edge halo. */
export const WALLPAPER_BLEED = 48

/** Root attribute flipped on while a wallpaper is live. */
export const WALLPAPER_ATTR = 'data-dsh-wallpaper'

/**
 * Root attribute flipped on while the transparent theme is effective (the
 * flag is on and a wallpaper is live). The stylesheet drops the wallpaper
 * dim mask under it so the image colors show through unmasked.
 */
export const TRANSPARENT_ATTR = 'data-dsh-transparent'

/**
 * Solidity fed into {@link mixWallpaperSurfaces} while the transparent theme
 * is effective: every chrome surface keeps a 0% fill so only the wallpaper
 * paints behind content. The terminal pane still keeps its solid fallback.
 */
export const TRANSPARENT_GLASS_SOLIDITY = 0

/**
 * Canvas fill percent never exceeds this while a wallpaper is mixed, so glass
 * 100% still lets the image show through the main chat. Sidebar and raised
 * surfaces keep the glass slider, including 100% opaque.
 */
export const MAX_WALLPAPER_CANVAS_SOLIDITY = 45

/** Glass opacity at or above which Appearance hints that the wallpaper is covered. */
export const WALLPAPER_HIGH_GLASS_HINT = 90

const ALLOWED_TYPES = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif'])

// The /i flag makes [A-Z] cover lowercase too, so a-z would be a duplicate.
const DATA_URL = /^data:image\/(?:png|jpe?g|webp|gif);base64,[A-Z0-9+/=\s]+$/i

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
  if (file.size > MAX_WALLPAPER_FILE_BYTES) return null
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

/** Pixel rectangle passed to CanvasRenderingContext2D.drawImage. */
export interface WallpaperCropRect {
  sx: number
  sy: number
  sw: number
  sh: number
}

/** Calculate a centered, zoomed cover crop for a source image. */
export function wallpaperCropRect(
  width: number,
  height: number,
  aspect: number,
  zoom: number,
  panX: number,
  panY: number,
): WallpaperCropRect {
  const safeWidth = Math.max(1, width)
  const safeHeight = Math.max(1, height)
  const safeAspect = Math.max(0.25, aspect || 1)
  const coverWidth = safeWidth / safeHeight >= safeAspect ? safeHeight * safeAspect : safeWidth
  const coverHeight = safeWidth / safeHeight >= safeAspect ? safeHeight : safeWidth / safeAspect
  const safeZoom = Math.max(1, zoom || 1)
  const sw = Math.max(1, Math.min(safeWidth, coverWidth / safeZoom))
  const sh = Math.max(1, Math.min(safeHeight, coverHeight / safeZoom))
  const maxX = Math.max(0, safeWidth - sw)
  const maxY = Math.max(0, safeHeight - sh)
  return {
    sx: Math.round(maxX * Math.min(1, Math.max(0, panX))),
    sy: Math.round(maxY * Math.min(1, Math.max(0, panY))),
    sw: Math.round(sw),
    sh: Math.round(sh),
  }
}

/** Crop a data URL in a bounded browser canvas; decode or canvas failures fail closed. */
export function cropWallpaper(dataUrl: string, rect: WallpaperCropRect): Promise<string | null> {
  return new Promise((resolve) => {
    if (!isWallpaperDataUrl(dataUrl) || typeof Image === 'undefined' || typeof document === 'undefined') {
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
    const timer = setTimeout(() => { finish(null) }, 1000)
    image.onload = (): void => {
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, rect.sw)
      canvas.height = Math.max(1, rect.sh)
      const context = canvas.getContext('2d')
      if (context === null) {
        finish(null)
        return
      }
      try {
        context.drawImage(image, rect.sx, rect.sy, rect.sw, rect.sh, 0, 0, canvas.width, canvas.height)
        const result = canvas.toDataURL('image/jpeg', 0.82)
        finish(isWallpaperDataUrl(result) && result.length <= MAX_WALLPAPER_DATA_URL_CHARS ? result : null)
      } catch {
        finish(null)
      }
    }
    image.onerror = () => { finish(null) }
    image.src = dataUrl
    if (image.complete) image.onload(new Event('load') as unknown as Event)
  })
}

/**
 * Main-canvas solidity derived from the glass slider, before the wallpaper
 * canvas cap. Sidebar mixing uses this so glass 100% still fully opaques the
 * rail.
 * @param kept - glass opacity percent, already clamped 0–100.
 * @returns the uncapped canvas fill percent, 0–100.
 */
function wallpaperCanvasSolidityUncapped(kept: number): number {
  if (kept <= 40) return Math.round(kept * 0.375)
  if (kept <= 80) return Math.round(15 + (kept - 40) * 0.75)
  return Math.round(45 + (kept - 80) * 2.75)
}

/**
 * Main-canvas solidity derived from the glass slider. The canvas is the
 * surface the wallpaper mostly shows through, so it sits well below the
 * raised-surface solidity around the default setting. The high end of the
 * slider still fully opaques sidebar and raised surfaces; the canvas itself
 * never exceeds {@link MAX_WALLPAPER_CANVAS_SOLIDITY}.
 * @param solidity - glass opacity percent.
 * @returns the canvas fill percent, 0–{@link MAX_WALLPAPER_CANVAS_SOLIDITY}.
 */
export function wallpaperCanvasSolidity(solidity: number): number {
  const kept = Math.min(100, Math.max(0, Math.round(solidity)))
  return Math.min(wallpaperCanvasSolidityUncapped(kept), MAX_WALLPAPER_CANVAS_SOLIDITY)
}

/**
 * Make the main chrome fills translucent so a wallpaper can show through.
 * Solidity is layered: the main canvas is the most see-through (capped),
 * the sidebar sits halfway between the uncapped canvas curve and glass so
 * glass 100% fully opaques the rail, and raised surfaces keep the full
 * glass solidity. A 100% mix stores the solid color, not a color-mix.
 * The terminal pane stays the opaque canvas fallback (or a family's solid
 * `--dsw-alias-bg-base`) so TUI SGR does not sit on wallpaper glass.
 * @param tokens - current alias tokens (may be empty for DeepSeek).
 * @param mode - resolved half, picks the sheet fallbacks.
 * @param solidity - percent of the solid fill kept (the user's glass opacity).
 * @returns a new token dictionary.
 */
export function mixWallpaperSurfaces(tokens: ThemeTokens, mode: 'light' | 'dark', solidity: number): ThemeTokens {
  const next: ThemeTokens = { ...tokens }
  const kept = Math.min(100, Math.max(0, Math.round(solidity)))
  const canvas = wallpaperCanvasSolidity(kept)
  const sidebar = Math.round((wallpaperCanvasSolidityUncapped(kept) + kept) / 2)
  const base = mode === 'dark'
    ? 'var(--dsw-static-neutral-bluish-950)'
    : 'var(--dsw-static-neutral-bluish-00)'
  const raised = mode === 'dark'
    ? 'var(--dsw-static-neutral-bluish-875)'
    : 'var(--dsw-static-neutral-bluish-00)'
  const surfaces: Record<string, { fallback: string; percent: number }> = {
    '--dsw-alias-bg-base': { fallback: base, percent: canvas },
    '--dsw-alias-bg-layer-1': { fallback: raised, percent: kept },
    '--dsw-alias-bg-layer-2': { fallback: raised, percent: kept },
    '--dsw-specific-sidebar-fill': { fallback: raised, percent: sidebar },
  }
  for (const [name, { fallback, percent }] of Object.entries(surfaces)) {
    const current = next[name]
    const solid = current !== undefined && !current.includes('color-mix') ? current : fallback
    next[name] = percent >= 100
      ? solid
      : `color-mix(in srgb, ${solid} ${percent}%, transparent)`
  }
  const pane = tokens['--dsw-alias-bg-base']
  next['--dsw-alias-terminal-pane'] =
    pane !== undefined && !pane.includes('color-mix') ? pane : base
  return next
}

/**
 * Last state written into the DOM. The wallpaper layer is a document
 * singleton, so this module-level cache is what keeps re-publishes cheap:
 * during a slider drag every theme publish calls {@link applyWallpaperLayer},
 * and re-setting the megabyte-scale data URL or redrawing the bitmap on every
 * tick is what makes dragging janky.
 */
let applied: { image: string; blurPx: number; factor: number } | null = null
let decodedFor = ''
let decoded: HTMLImageElement | null = null
let resizeBound = false

/** Viewport plus bleed, in CSS px (matches the stylesheet's inset). */
function layerCssSize(): { width: number; height: number } {
  const width = typeof window === 'undefined' ? 0 : window.innerWidth
  const height = typeof window === 'undefined' ? 0 : window.innerHeight
  return {
    width: Math.max(1, width + WALLPAPER_BLEED * 2),
    height: Math.max(1, height + WALLPAPER_BLEED * 2),
  }
}

/**
 * Cover-crop the decoded image into the canvas bitmap at `cssSize / factor`.
 * CSS stretches the bitmap back up with `image-rendering: pixelated`, which
 * is what makes pixelation actually visible (a transform scale is re-rastered
 * by the compositor at the final scale and shows nothing). A missing 2d
 * context (jsdom) leaves the CSS background-image fallback in place.
 */
function drawWallpaperBitmap(canvas: HTMLCanvasElement, image: HTMLImageElement, factor: number): void {
  const context = canvas.getContext('2d')
  if (context === null) return
  const { width, height } = layerCssSize()
  const bitmapWidth = Math.max(1, Math.round(width / factor))
  const bitmapHeight = Math.max(1, Math.round(height / factor))
  const sourceWidth = image.naturalWidth || image.width
  const sourceHeight = image.naturalHeight || image.height
  if (!sourceWidth || !sourceHeight) return
  canvas.width = bitmapWidth
  canvas.height = bitmapHeight
  const scale = Math.max(bitmapWidth / sourceWidth, bitmapHeight / sourceHeight)
  const drawWidth = sourceWidth * scale
  const drawHeight = sourceHeight * scale
  context.drawImage(image, (bitmapWidth - drawWidth) / 2, (bitmapHeight - drawHeight) / 2, drawWidth, drawHeight)
  canvas.style.backgroundImage = ''
}

/** Redraw with the currently applied state (image decode or viewport resize). */
function redrawApplied(): void {
  if (applied === null || typeof document === 'undefined') return
  const canvas = document.getElementById(WALLPAPER_INNER_ID)
  if (canvas === null) return
  redrawWallpaper(canvas as HTMLCanvasElement, applied.image, applied.factor)
}

/** Draw now when the image is decoded, otherwise decode once and draw on load. */
function redrawWallpaper(canvas: HTMLCanvasElement, image: string, factor: number): void {
  if (decodedFor === image && decoded !== null) {
    if (decoded.complete) drawWallpaperBitmap(canvas, decoded, factor)
    return
  }
  if (typeof Image === 'undefined') return
  const next = new Image()
  decodedFor = image
  decoded = next
  next.onload = () => {
    if (decoded !== next || applied === null || applied.image !== image) return
    redrawApplied()
  }
  next.src = image
  if (next.complete) drawWallpaperBitmap(canvas, next, factor)
}

/**
 * Paint or remove the fixed wallpaper layer. Idempotent per field: only the
 * fields that actually changed touch the DOM. Safe when `document` is missing.
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
    applied = null
    decoded = null
    decodedFor = ''
    root.removeAttribute(WALLPAPER_ATTR)
    document.getElementById(WALLPAPER_LAYER_ID)?.remove()
    root.style.removeProperty('--dsh-wallpaper-blur')
    if (resizeBound && typeof window !== 'undefined') {
      window.removeEventListener('resize', redrawApplied)
      resizeBound = false
    }
    return
  }
  const blurPx = wallpaperBlurPx(extras.wallpaperBlur)
  const factor = wallpaperPixelFactor(extras.wallpaperPixelate)
  root.setAttribute(WALLPAPER_ATTR, '')
  let layer = document.getElementById(WALLPAPER_LAYER_ID)
  let canvas: HTMLCanvasElement
  if (layer === null) {
    layer = document.createElement('div')
    layer.id = WALLPAPER_LAYER_ID
    layer.setAttribute('aria-hidden', 'true')
    canvas = document.createElement('canvas')
    canvas.id = WALLPAPER_INNER_ID
    layer.appendChild(canvas)
    document.body.insertBefore(layer, document.body.firstChild)
    applied = null
  } else {
    canvas = layer.firstElementChild as HTMLCanvasElement
  }
  if (!resizeBound && typeof window !== 'undefined') {
    window.addEventListener('resize', redrawApplied)
    resizeBound = true
  }
  if (applied === null || applied.blurPx !== blurPx) {
    root.style.setProperty('--dsh-wallpaper-blur', `${blurPx}px`)
  }
  const imageChanged = applied === null || applied.image !== image
  const factorChanged = applied === null || applied.factor !== factor
  if (imageChanged) canvas.style.backgroundImage = `url("${image}")`
  applied = { image, blurPx, factor }
  if (imageChanged || factorChanged) redrawWallpaper(canvas, image, factor)
}
