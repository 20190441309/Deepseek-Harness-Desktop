/**
 * Appearance wallpaper row: pick an image, then frost and pixelate sliders.
 */
import { useRef } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import {
  DEFAULT_WALLPAPER_EFFECT, MAX_WALLPAPER_EFFECT, MIN_WALLPAPER_EFFECT,
  WALLPAPER_EFFECT_STEP, encodeWallpaperFile,
} from '../wallpaper.ts'
import type { ThemeSettings } from '../theme-settings.ts'
import type { ThemeKey } from './locales.ts'
import css from './AppearanceSection.module.css'

/** Persist wallpaper image and/or the two effect sliders. */
export type SetWallpaper = (
  patch: Partial<Pick<ThemeSettings, 'wallpaperImage' | 'wallpaperBlur' | 'wallpaperPixelate'>>,
) => void

/**
 * Render the wallpaper picker and, once an image is set, the two sliders.
 * @param props - current extras, copy, and the write callback.
 * @returns the wallpaper block.
 */
export function WallpaperRow({
  wallpaperImage,
  wallpaperBlur,
  wallpaperPixelate,
  t,
  setWallpaper,
}: {
  wallpaperImage: string
  wallpaperBlur: number
  wallpaperPixelate: number
  t: (key: ThemeKey) => string
  setWallpaper: SetWallpaper
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const hasImage = wallpaperImage.length > 0

  const pick = async (file: File | undefined): Promise<void> => {
    if (file === undefined) return
    const encoded = await encodeWallpaperFile(file)
    if (encoded === null) return
    setWallpaper({ wallpaperImage: encoded })
  }

  return (
    <section className={css.block} aria-labelledby="appearance-wallpaper-heading">
      <div className={css.rowHead}>
        <h2 id="appearance-wallpaper-heading" className={css.heading}>{t('wallpaper.title')}</h2>
      </div>
      <p className={css.hint}>{t('wallpaper.description')}</p>
      <div className={css.wallpaperActions}>
        <Button type="button" variant="outline" onClick={() => { fileRef.current?.click() }}>
          {t('wallpaper.choose')}
        </Button>
        {hasImage ? (
          <Button type="button" variant="ghost" onClick={() => { setWallpaper({ wallpaperImage: '' }) }}>
            {t('wallpaper.clear')}
          </Button>
        ) : null}
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          hidden
          onChange={event => {
            const file = event.currentTarget.files?.[0]
            event.currentTarget.value = ''
            void pick(file)
          }}
        />
      </div>
      {hasImage ? (
        <>
          <div
            className={css.wallpaperPreview}
            style={{ backgroundImage: `url("${wallpaperImage}")` }}
            role="img"
            aria-label={t('wallpaper.title')}
          />
          <label className={css.field}>
            <span className={css.rowHead}>
              <span>{t('wallpaper.blur')}</span>
              <span className={css.value}>{wallpaperBlur}%</span>
            </span>
            <input
              type="range"
              className={css.slider}
              min={MIN_WALLPAPER_EFFECT}
              max={MAX_WALLPAPER_EFFECT}
              step={WALLPAPER_EFFECT_STEP}
              value={wallpaperBlur}
              aria-valuemin={MIN_WALLPAPER_EFFECT}
              aria-valuemax={MAX_WALLPAPER_EFFECT}
              aria-valuenow={wallpaperBlur}
              aria-label={t('wallpaper.blur')}
              onChange={event => { setWallpaper({ wallpaperBlur: Number(event.currentTarget.value) }) }}
            />
          </label>
          <label className={css.field}>
            <span className={css.rowHead}>
              <span>{t('wallpaper.pixelate')}</span>
              <span className={css.value}>{wallpaperPixelate}%</span>
            </span>
            <input
              type="range"
              className={css.slider}
              min={MIN_WALLPAPER_EFFECT}
              max={MAX_WALLPAPER_EFFECT}
              step={WALLPAPER_EFFECT_STEP}
              value={wallpaperPixelate}
              aria-valuemin={MIN_WALLPAPER_EFFECT}
              aria-valuemax={MAX_WALLPAPER_EFFECT}
              aria-valuenow={wallpaperPixelate}
              aria-label={t('wallpaper.pixelate')}
              onChange={event => { setWallpaper({ wallpaperPixelate: Number(event.currentTarget.value) }) }}
            />
          </label>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setWallpaper({
                wallpaperBlur: DEFAULT_WALLPAPER_EFFECT,
                wallpaperPixelate: DEFAULT_WALLPAPER_EFFECT,
              })
            }}
          >
            {t('reset')}
          </Button>
        </>
      ) : null}
    </section>
  )
}
