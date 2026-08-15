import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { NS } from './locales.ts'
import type { PreviewBounds, PreviewShellInjected } from './shell.ts'
import css from './PreviewPanel.module.css'

export type PreviewPanelProps =
  & PropsRuntime<'surfaces.browser'>
  & PropsLocale<typeof NS>
  & InjectFace<PreviewShellInjected>

function readBounds(el: HTMLElement | null): PreviewBounds | undefined {
  if (el === null) return undefined
  const box = el.getBoundingClientRect()
  return {
    x: Math.round(box.left),
    y: Math.round(box.top),
    width: Math.round(box.width),
    height: Math.round(box.height),
  }
}

function visibleBounds(bounds: PreviewBounds | undefined): PreviewBounds | undefined {
  if (bounds === undefined || bounds.width <= 0 || bounds.height <= 0) return undefined
  return bounds
}

/**
 * Desktop-only local URL occupant of `surfaces.browser`. The guest paints in
 * a main-process BrowserView over `host`; the renderer never loads Node.
 * @param props - session-maybe seats, preview IPC, and copy.
 * @returns the browser surface.
 */
export function PreviewPanel({
  previewAvailable,
  previewOpen,
  previewNavigate,
  previewResize,
  previewHide,
  previewShow,
  previewClose,
  t,
}: PreviewPanelProps): ReactNode {
  const hostRef = useRef<HTMLDivElement>(null)
  const [draft, setDraft] = useState('http://127.0.0.1:3000')
  const [previewId, setPreviewId] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    if (previewId === null) return
    let visible = false
    const sync = (): void => {
      const bounds = visibleBounds(readBounds(hostRef.current))
      if (bounds === undefined) {
        if (visible) {
          visible = false
          void previewHide(previewId).catch(() => {})
        }
        return
      }
      if (!visible) {
        visible = true
        void previewShow(previewId, bounds).catch(() => {})
        return
      }
      void previewResize(previewId, bounds).catch(() => {})
    }
    sync()
    const host = hostRef.current
    const observer = host === null || typeof ResizeObserver === 'undefined'
      ? undefined
      : new ResizeObserver(() => { sync() })
    if (host !== null) observer?.observe(host)
    window.addEventListener('resize', sync)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', sync)
      void previewHide(previewId).catch(() => {})
    }
  }, [previewId, previewHide, previewResize, previewShow])

  useEffect(() => () => {
    if (previewId !== null) void previewClose(previewId).catch(() => {})
  }, [previewId, previewClose])

  const submit = (event: FormEvent): void => {
    event.preventDefault()
    const url = draft.trim()
    const bounds = readBounds(hostRef.current)
    void (previewId === null
      ? previewOpen({ url, ...(bounds !== undefined ? { bounds } : {}) })
      : previewNavigate(previewId, url)
    ).then(result => {
      if (!result.ok) {
        setMessage(result.message ?? t('rejected'))
        return
      }
      setMessage(null)
      if (result.id !== undefined) setPreviewId(result.id)
    }).catch(() => { setMessage(t('rejected')) })
  }

  return (
    <div className={css.root} data-preview-panel>
      <div className={css.header} data-surface-subheader>
        <h3 className={css.title}>{t('title')}</h3>
      </div>
      {!previewAvailable ? (
        <p className={css.message} data-preview-unavailable>{t('unavailable')}</p>
      ) : (
        <>
          <form className={css.toolbar} onSubmit={submit}>
            <input
              className={css.url}
              value={draft}
              placeholder={t('placeholder')}
              aria-label={t('title')}
              onChange={event => { setDraft(event.target.value) }}
            />
            <button type="submit" className={css.open}>{t('open')}</button>
          </form>
          <p className={css.message}>{message ?? t('empty')}</p>
          <div ref={hostRef} className={css.host} data-preview-host />
        </>
      )}
    </div>
  )
}
