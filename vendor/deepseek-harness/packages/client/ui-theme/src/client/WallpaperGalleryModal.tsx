/**
 * Wallpaper gallery dialog: leftover thumbnail grid plus an in-window source pane.
 */
import { useEffect, useState } from 'react'
import { Button, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { WallpaperSource } from '../theme-settings.ts'
import type { ThemeKey } from './locales.ts'
import type { WallpaperCatalogItem } from './wallpaper-shell.ts'
import { WallpaperSources } from './WallpaperSources.tsx'
import css from './AppearanceSection.module.css'

/**
 * Render the gallery picker.
 * @param props.open - whether the dialog is showing.
 * @param props.items - merged catalog rows.
 * @param props.warning - optional fetch warning.
 * @param props.busyId - id currently downloading, if any.
 * @param props.wallpaperSources - persisted gallery sources.
 * @param props.setWallpaperSources - persist a sanitized source list; omitted off desktop.
 * @param props.t - Appearance copy.
 * @param props.onClose - dismiss.
 * @param props.onPick - choose a row to download and crop.
 * @returns the modal tree.
 */
export function WallpaperGalleryModal({
  open,
  items,
  warning,
  busyId,
  wallpaperSources,
  setWallpaperSources,
  t,
  onClose,
  onPick,
}: {
  open: boolean
  items: readonly WallpaperCatalogItem[]
  warning: string | undefined
  busyId: string | undefined
  wallpaperSources: readonly WallpaperSource[]
  setWallpaperSources?: (patch: { wallpaperSources: WallpaperSource[] }) => void
  t: (key: ThemeKey) => string
  onClose: () => void
  onPick: (item: WallpaperCatalogItem) => void
}) {
  const [pane, setPane] = useState<'gallery' | 'sources'>('gallery')

  useEffect(() => {
    if (!open) setPane('gallery')
  }, [open])

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('wallpaper.browse')}
      closeLabel={t('wallpaper.close')}
      className={css.galleryDialog ?? ''}
      contentClassName={css.galleryContent ?? ''}
      headerActions={setWallpaperSources !== undefined ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => { setPane(current => current === 'sources' ? 'gallery' : 'sources') }}
        >
          {pane === 'sources' ? t('wallpaper.backToGallery') : t('wallpaper.sources')}
        </Button>
      ) : null}
      footer={<Button type="button" onClick={onClose}>{t('editor.cancel')}</Button>}
    >
      {pane === 'sources' && setWallpaperSources !== undefined ? (
        <WallpaperSources
          wallpaperSources={wallpaperSources}
          t={t}
          setWallpaperSources={setWallpaperSources}
        />
      ) : (
        <>
          {warning ? <p className={css.hint} role="status">{warning}</p> : null}
          {busyId !== undefined ? <p className={css.hint} role="status">{t('wallpaper.downloading')}</p> : null}
          {items.length === 0 ? (
            <p className={css.hint}>{t('wallpaper.galleryEmpty')}</p>
          ) : (
            <div className={css.galleryGrid}>
              {items.map((item) => (
                <button
                  key={`${item.source}:${item.id}`}
                  type="button"
                  className={css.galleryCard}
                  disabled={busyId !== undefined}
                  onClick={() => { onPick(item) }}
                >
                  <img className={css.galleryThumb} src={item.thumbUrl} alt="" referrerPolicy="no-referrer" />
                  <span className={css.galleryMeta}>
                    <span className={css.galleryTitle}>{item.title || item.id}</span>
                    {item.copyright ? <span className={css.galleryCopyright}>{item.copyright}</span> : null}
                  </span>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </Modal>
  )
}
