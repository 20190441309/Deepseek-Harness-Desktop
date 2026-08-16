import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Button, Input } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { NS } from './locales.ts'
import type { DiscoveredServer, PreviewBounds, PreviewNavState, PreviewShellInjected } from './shell.ts'
import { normalizeLocalPreviewUrl } from './url.ts'
import css from './PreviewPanel.module.css'

/** Must match ui-user-terminal; client packages cannot share a value export. */
const OPEN_SURFACE_EVENT = 'dsh-open-surface'
/** Must match ui-user-terminal; client packages cannot share a value export. */
const PENDING_PREVIEW_URL_KEY = 'dsh-pending-preview-url'
const DISCOVER_INTERVAL_MS = 8_000

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
 * Inactive tabs keep the guest alive (`previewHide`); only unmount closes it.
 * @param props - session-maybe seats, preview IPC, active tab flag, and copy.
 * @returns the browser surface.
 */
export function PreviewPanel({
  active,
  previewAvailable,
  previewOpen,
  previewNavigate,
  previewBack,
  previewForward,
  previewReload,
  onPreviewStateChange = () => () => {},
  previewOpenDevTools,
  previewDiscover,
  openExternal,
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
  const [canGoBack, setCanGoBack] = useState(false)
  const [canGoForward, setCanGoForward] = useState(false)
  const [servers, setServers] = useState<DiscoveredServer[]>([])

  useEffect(() => {
    if (!previewAvailable) return
    let cancelled = false
    const load = (): void => {
      void previewDiscover().then((found) => {
        if (!cancelled) setServers(found)
      }).catch(() => {
        if (!cancelled) setServers([])
      })
    }
    load()
    const timer = window.setInterval(load, DISCOVER_INTERVAL_MS)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [previewAvailable, previewDiscover])

  useEffect(() => {
    if (previewId === null) return
    if (!active) {
      void previewHide(previewId).catch(() => {})
      return
    }
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
  }, [previewId, active, previewHide, previewResize, previewShow])

  useEffect(() => () => {
    if (previewId !== null) void previewClose(previewId).catch(() => {})
  }, [previewId, previewClose])

  const applyNav = (result: PreviewNavState): void => {
    if (!result.ok) {
      setMessage(result.message ?? t('rejected'))
      return
    }
    setMessage(null)
    if (result.id !== undefined) setPreviewId(result.id)
    if (result.url !== undefined) setDraft(result.url)
    setCanGoBack(result.canGoBack === true)
    setCanGoForward(result.canGoForward === true)
  }

  const applyNavRef = useRef(applyNav)
  applyNavRef.current = applyNav
  const previewIdRef = useRef(previewId)
  previewIdRef.current = previewId

  useEffect(() => {
    return onPreviewStateChange((state) => {
      if (previewIdRef.current !== null && state.id === previewIdRef.current) {
        applyNavRef.current(state)
      }
    })
  }, [onPreviewStateChange])

  const launch = (url: string): void => {
    const trimmed = normalizeLocalPreviewUrl(url)
    if (trimmed.length === 0) return
    const bounds = readBounds(hostRef.current)
    const currentId = previewIdRef.current
    void (currentId === null
      ? previewOpen({ url: trimmed, ...(bounds !== undefined ? { bounds } : {}) })
      : previewNavigate(currentId, trimmed)
    ).then(result => { applyNavRef.current(result) }).catch(() => { setMessage(t('rejected')) })
  }

  useEffect(() => {
    try {
      const pending = sessionStorage.getItem(PENDING_PREVIEW_URL_KEY)
      if (pending !== null && pending.length > 0) {
        sessionStorage.removeItem(PENDING_PREVIEW_URL_KEY)
        launch(pending)
      }
    } catch {
      // sessionStorage can throw in a locked browser profile.
    }
    const onOpen = (event: Event): void => {
      const url = (event as CustomEvent<{ url?: string }>).detail?.url
      if (typeof url !== 'string' || url.length === 0) return
      try {
        sessionStorage.removeItem(PENDING_PREVIEW_URL_KEY)
      } catch {
        // sessionStorage can throw in a locked browser profile.
      }
      launch(url)
    }
    window.addEventListener(OPEN_SURFACE_EVENT, onOpen)
    return () => { window.removeEventListener(OPEN_SURFACE_EVENT, onOpen) }
  }, [previewOpen, previewNavigate, t])

  const submit = (event: FormEvent): void => {
    event.preventDefault()
    launch(draft)
  }

  return (
    <div className={css.root} data-preview-panel>
      {!previewAvailable ? (
        <p className={css.message} data-preview-unavailable>{t('unavailable')}</p>
      ) : (
        <>
          <form className={css.toolbar} onSubmit={submit}>
            <Button
              variant="ghost"
              size="sm"
              disabled={previewId === null || !canGoBack}
              aria-label={t('back')}
              onClick={() => { if (previewId !== null) void previewBack(previewId).then(applyNav) }}
            >
              {t('back')}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={previewId === null || !canGoForward}
              aria-label={t('forward')}
              onClick={() => { if (previewId !== null) void previewForward(previewId).then(applyNav) }}
            >
              {t('forward')}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={previewId === null}
              aria-label={t('reload')}
              onClick={() => { if (previewId !== null) void previewReload(previewId).then(applyNav) }}
            >
              {t('reload')}
            </Button>
            <Input
              className={css.url}
              value={draft}
              placeholder={t('placeholder')}
              aria-label={t('title')}
              onChange={event => { setDraft(event.target.value) }}
            />
            <Button variant="primary" size="sm" type="submit">{t('open')}</Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={normalizeLocalPreviewUrl(draft).length === 0}
              aria-label={t('external')}
              onClick={() => { void openExternal(normalizeLocalPreviewUrl(draft)) }}
            >
              {t('external')}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={previewId === null}
              aria-label={t('devtools')}
              onClick={() => { if (previewId !== null) void previewOpenDevTools(previewId) }}
            >
              {t('devtools')}
            </Button>
          </form>
          <p className={css.message}>{message ?? t('empty')}</p>
          {servers.length > 0 ? (
            <div className={css.discovered}>
              <p className={css.discoveredTitle}>{t('discovered')}</p>
              {servers.map(server => (
                <Button
                  key={server.url}
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setDraft(server.url)
                    launch(server.url)
                  }}
                >
                  {server.url}
                </Button>
              ))}
            </div>
          ) : null}
          <div ref={hostRef} className={css.host} data-preview-host />
        </>
      )}
    </div>
  )
}
