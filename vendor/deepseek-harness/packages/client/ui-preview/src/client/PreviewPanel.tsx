import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ReactElement, type ReactNode } from 'react'
import {
  Button,
  IconChevronLeftOutline14,
  IconChevronRightOutline14,
  IconEllipsisOutline16,
  IconRefreshOutline14,
  IconRightUpOutline16,
  Input,
  Menu,
  Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { NS } from './locales.ts'
import type { DiscoveredServer, PreviewBounds, PreviewNavState, PreviewShellInjected } from './shell.ts'
import { normalizeLocalPreviewUrl } from './url.ts'
import css from './PreviewPanel.module.css'

/** Must match ui-user-terminal; client packages cannot share a value export. */
const OPEN_SURFACE_EVENT = 'dshd-open-surface'
/** Must match ui-user-terminal; client packages cannot share a value export. */
const PENDING_PREVIEW_URL_KEY = 'dshd-pending-preview-url'
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

function ChromeButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string
  disabled?: boolean
  onClick: () => void
  children: ReactNode
}): ReactElement {
  return (
    <Tooltip label={label} side="bottom">
      <button
        type="button"
        className={css.icon}
        disabled={disabled}
        aria-label={label}
        onClick={onClick}
      >
        {children}
      </button>
    </Tooltip>
  )
}

/**
 * Desktop-only local URL occupant of `surfaces.browser`. The guest paints in
 * a main-process BrowserView over `host`; the renderer never loads Node.
 * Inactive tabs keep the guest alive (`previewHide`); only unmount closes it.
 * Chrome is icon Back/Forward/Reload, an Input that submits on Enter, a
 * system-browser icon, and a More menu for DevTools.
 * @param props - session-maybe seats, preview IPC, guest visibility flags, and copy.
 * @returns the browser surface.
 */
export function PreviewPanel({
  active,
  occluded,
  previewAvailable,
  previewOpen,
  previewNavigate,
  previewBack,
  previewForward,
  previewReload,
  // oxlint-disable-next-line typescript/no-useless-default-assignment -- browser-only callers may omit the optional shell callback.
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
  const [url, setUrl] = useState('')
  const [draft, setDraft] = useState('')
  const [previewId, setPreviewId] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [canGoBack, setCanGoBack] = useState(false)
  const [canGoForward, setCanGoForward] = useState(false)
  const [servers, setServers] = useState<DiscoveredServer[]>([])
  const [moreOpen, setMoreOpen] = useState(false)
  const focusedRef = useRef(false)

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
    if (!active || occluded || moreOpen) {
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
  }, [previewId, active, occluded, moreOpen, previewHide, previewResize, previewShow])

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
    if (result.url !== undefined) {
      setUrl(result.url)
      if (!focusedRef.current) setDraft(result.url)
    }
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

  const launch = (next: string): void => {
    const trimmed = normalizeLocalPreviewUrl(next)
    if (trimmed.length === 0) return
    const bounds = readBounds(hostRef.current)
    const currentId = previewIdRef.current
    void (currentId === null
      ? previewOpen({ url: trimmed, ...(bounds !== undefined ? { bounds } : {}) })
      : previewNavigate(currentId, trimmed)
    ).then((result) => { applyNavRef.current(result) }).catch(() => { setMessage(t('rejected')) })
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
      const next = (event as CustomEvent<{ url?: string } | undefined>).detail?.url
      if (typeof next !== 'string' || next.length === 0) return
      try {
        sessionStorage.removeItem(PENDING_PREVIEW_URL_KEY)
      } catch {
        // sessionStorage can throw in a locked browser profile.
      }
      launch(next)
    }
    window.addEventListener(OPEN_SURFACE_EVENT, onOpen)
    return () => { window.removeEventListener(OPEN_SURFACE_EVENT, onOpen) }
  }, [previewOpen, previewNavigate, t])

  const submit = (event: FormEvent): void => {
    event.preventDefault()
    launch(draft)
  }

  const onUrlKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key !== 'Escape') return
    event.preventDefault()
    setDraft(url)
    event.currentTarget.blur()
  }

  const barUrl = normalizeLocalPreviewUrl(draft)

  return (
    <div className={css.root} data-preview-panel>
      {!previewAvailable ? (
        <p className={css.message} data-preview-unavailable>{t('unavailable')}</p>
      ) : (
        <>
          <form className={css.toolbar} data-preview-toolbar onSubmit={submit}>
            <div className={css.nav} role="group" aria-label={t('navigation')}>
              <ChromeButton
                label={t('back')}
                disabled={previewId === null || !canGoBack}
                onClick={() => { if (previewId !== null) void previewBack(previewId).then(applyNav) }}
              >
                <IconChevronLeftOutline14 size={14} />
              </ChromeButton>
              <ChromeButton
                label={t('forward')}
                disabled={previewId === null || !canGoForward}
                onClick={() => { if (previewId !== null) void previewForward(previewId).then(applyNav) }}
              >
                <IconChevronRightOutline14 size={14} />
              </ChromeButton>
              <ChromeButton
                label={t('reload')}
                disabled={previewId === null}
                onClick={() => { if (previewId !== null) void previewReload(previewId).then(applyNav) }}
              >
                <IconRefreshOutline14 size={14} />
              </ChromeButton>
            </div>
            <Input
              className={css.url}
              value={draft}
              placeholder={t('placeholder')}
              aria-label={t('title')}
              spellCheck={false}
              data-preview-url-input
              onChange={(event) => { setDraft(event.target.value) }}
              onFocus={(event) => {
                focusedRef.current = true
                const node = event.currentTarget
                queueMicrotask(() => { node.select() })
              }}
              onBlur={() => { focusedRef.current = false }}
              onKeyDown={onUrlKeyDown}
            />
            <ChromeButton
              label={t('external')}
              disabled={barUrl.length === 0}
              onClick={() => { void openExternal(barUrl) }}
            >
              <IconRightUpOutline16 size={14} />
            </ChromeButton>
            <Menu
              compact
              portal
              align="end"
              open={moreOpen}
              items={[{
                id: 'devtools',
                label: t('devtools'),
                disabled: previewId === null,
              }]}
              onSelect={(id) => {
                setMoreOpen(false)
                if (id === 'devtools' && previewId !== null) void previewOpenDevTools(previewId)
              }}
              onClose={() => { setMoreOpen(false) }}
              anchor={(
                <Tooltip label={t('more')} side="bottom">
                  <button
                    type="button"
                    className={css.icon}
                    aria-label={t('more')}
                    aria-expanded={moreOpen}
                    onClick={() => { setMoreOpen(open => !open) }}
                  >
                    <IconEllipsisOutline16 size={14} />
                  </button>
                </Tooltip>
              )}
            />
          </form>
          {message !== null || previewId === null ? (
            <p className={css.message}>{message ?? t('empty')}</p>
          ) : null}
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
