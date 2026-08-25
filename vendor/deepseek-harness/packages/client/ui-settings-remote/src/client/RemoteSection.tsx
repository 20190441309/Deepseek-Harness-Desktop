import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Button, IconChevronRightOutline14 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type { RemotePatch, RemoteSnapshot } from './desktop-shell.ts'
import { qrSvg } from './qr.ts'
import css from './RemoteSection.module.css'

/** Registration-side desktop callbacks used by the Remote popup. */
export interface RemoteSectionInjected {
  /** Read the current gateway snapshot. */
  getRemote: () => Promise<RemoteSnapshot | null>
  /** Persist a remote config patch and return the new snapshot. */
  saveRemote: (patch: RemotePatch) => Promise<RemoteSnapshot | null>
  /** Drop one bound device; its cookie stops authorizing. */
  unbindRemoteDevice: (id: string) => Promise<RemoteSnapshot | null>
}

/** Full component props assembled by the sidebar footer-action slot. */
export type RemoteSectionProps =
  PropsRuntime<'sidebar.footer.action'>
  & PropsLocale<'settings.remote'>
  & InjectFace<RemoteSectionInjected>

const EMPTY: RemoteSnapshot = { urls: [], devices: [] }
const REFRESH_MS = 2000

function PhoneIcon({ size }: { size: number }): ReactNode {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="4" y="1.4" width="8" height="13.2" rx="1.8" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="8" cy="12.1" r="0.75" fill="currentColor" />
    </svg>
  )
}

function formatStamp(value: string, unknown: string): string {
  const stamp = Date.parse(value)
  if (!Number.isFinite(stamp)) return unknown
  return new Date(stamp).toLocaleString()
}

/**
 * Sidebar-foot Remote control: a phone trigger plus a popup with On/Off,
 * LAN versus server relay, the pairing QR, and bound-device management.
 * @param props - composed slot props plus the desktop inject face.
 * @returns the trigger and optional popup.
 */
export function RemoteSection({
  wide,
  t,
  getRemote,
  saveRemote,
  unbindRemoteDevice,
}: RemoteSectionProps): ReactNode {
  const [snap, setSnap] = useState<RemoteSnapshot | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState(false)
  const [devicesOpen, setDevicesOpen] = useState(false)
  const modeWrites = useRef(0)

  const applySnap = useCallback((next: RemoteSnapshot | null) => {
    const value = next ?? EMPTY
    setSnap(value)
    setError(value.error || '')
  }, [])

  const load = useCallback(async () => {
    setBusy(true)
    try {
      applySnap(await getRemote())
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setBusy(false)
    }
  }, [applySnap, getRemote])

  const refresh = useCallback(async () => {
    if (modeWrites.current > 0) return
    try {
      applySnap(await getRemote())
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    }
  }, [applySnap, getRemote])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!open) {
      setDevicesOpen(false)
      return
    }
    const id = window.setInterval(() => { void refresh() }, REFRESH_MS)
    return () => { window.clearInterval(id) }
  }, [open, refresh])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      if (devicesOpen) setDevicesOpen(false)
      else setOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => { document.removeEventListener('keydown', onKeyDown) }
  }, [open, devicesOpen])

  const save = useCallback(async (patch: RemotePatch) => {
    // A local const keeps the narrowing alive inside the setState closure.
    const nextMode = patch.remoteMode
    if (nextMode) {
      modeWrites.current += 1
      setSnap(current => (current === null ? null : { ...current, mode: nextMode }))
      try {
        applySnap(await saveRemote(patch))
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : String(caught)
        try {
          applySnap(await getRemote())
        } catch {
          /* The optimistic mode stays until the next refresh. */
        }
        setError(message)
      } finally {
        modeWrites.current -= 1
      }
      return
    }
    setBusy(true)
    try {
      applySnap(await saveRemote(patch))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setBusy(false)
    }
  }, [applySnap, getRemote, saveRemote])

  const unbind = useCallback(async (id: string) => {
    setBusy(true)
    try {
      applySnap(await unbindRemoteDevice(id))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setBusy(false)
    }
  }, [applySnap, unbindRemoteDevice])

  const pairingUrl = snap?.urls?.[0]?.pairingUrl || ''
  const qr = useMemo(() => qrSvg(pairingUrl), [pairingUrl])
  const enabled = Boolean(snap?.enabled)
  const mode = snap?.mode === 'relay' ? 'relay' : 'lan'
  const devices = snap?.devices ?? []
  const bindAddress = snap?.bindAddress || '0.0.0.0'
  const lanTls = Boolean(snap?.lanTls)
  const bindOptions = useMemo(() => {
    const nics = (snap?.addresses ?? []).filter(address => address !== '127.0.0.1')
    const options = ['0.0.0.0', '127.0.0.1', ...nics]
    // A configured NIC that just went away stays selectable so the user can
    // see and change what the gateway is still bound to.
    return options.includes(bindAddress) ? options : [...options, bindAddress]
  }, [snap?.addresses, bindAddress])
  const bindLabel = (option: string): string => {
    if (option === '0.0.0.0') return t('bindAll')
    if (option === '127.0.0.1') return t('bindLoopback')
    return option
  }

  return (
    <div className={wide ? css.layer : `${css.layer} ${css.rail}`}>
      <button
        type="button"
        className={css.trigger}
        data-dsh-remote-trigger=""
        data-on={enabled || undefined}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={t('trigger')}
        onClick={() => { setOpen(value => !value) }}
      >
        <PhoneIcon size={wide ? 16 : 18} />
        {wide && <span className={css.triggerLabel}>{t('trigger')}</span>}
      </button>
      {open ? (
        <div className={css.overlay} role="presentation">
          <div className={css.mask} aria-hidden="true" onClick={() => { setOpen(false) }} />
          <div className={css.panel} role="dialog" aria-modal="true" aria-label={t('heading')}>
            <h2 className={css.heading}>{t('heading')}</h2>
            {!snap && error ? (
              <>
                <p className={css.status} role="status">{t('error')}</p>
                <button type="button" className={css.retry} onClick={() => { void load() }}>{t('retry')}</button>
              </>
            ) : !snap ? (
              <p className={css.status} role="status">{t('loading')}</p>
            ) : (
              <>
                <div className={css.modes} role="radiogroup" aria-label={t('enable')}>
                  <Button
                    size="sm"
                    variant={enabled ? 'primary' : 'ghost'}
                    className={css.modeButton}
                    role="radio"
                    aria-checked={enabled}
                    disabled={busy}
                    onClick={() => { if (!enabled) void save({ remoteEnabled: true }) }}
                  >
                    {t('enabledOn')}
                  </Button>
                  <Button
                    size="sm"
                    variant={enabled ? 'ghost' : 'primary'}
                    className={css.modeButton}
                    role="radio"
                    aria-checked={!enabled}
                    disabled={busy}
                    onClick={() => { if (enabled) void save({ remoteEnabled: false }) }}
                  >
                    {t('enabledOff')}
                  </Button>
                </div>
                <div className={css.modes} role="radiogroup" aria-label={t('mode')}>
                  <Button
                    size="sm"
                    variant={mode === 'lan' ? 'primary' : 'ghost'}
                    className={css.modeButton}
                    role="radio"
                    aria-checked={mode === 'lan'}
                    onClick={() => { void save({ remoteMode: 'lan' }) }}
                  >
                    {t('modeLan')}
                  </Button>
                  <Button
                    size="sm"
                    variant={mode === 'relay' ? 'primary' : 'ghost'}
                    className={css.modeButton}
                    role="radio"
                    aria-checked={mode === 'relay'}
                    onClick={() => { void save({ remoteMode: 'relay' }) }}
                  >
                    {t('modeRelay')}
                  </Button>
                </div>
                {mode === 'lan' ? (
                  <>
                    <div className={css.scopeGroup} role="radiogroup" aria-label={t('bindScope')}>
                      {bindOptions.map(option => (
                        <Button
                          key={option}
                          size="sm"
                          variant={bindAddress === option ? 'primary' : 'ghost'}
                          className={css.scopeButton}
                          role="radio"
                          aria-checked={bindAddress === option}
                          disabled={busy}
                          onClick={() => { if (bindAddress !== option) void save({ remoteBindAddress: option }) }}
                        >
                          {bindLabel(option)}
                        </Button>
                      ))}
                    </div>
                    <div className={css.modes} role="radiogroup" aria-label={t('lanTransport')}>
                      <Button
                        size="sm"
                        variant={lanTls ? 'ghost' : 'primary'}
                        className={css.modeButton}
                        role="radio"
                        aria-checked={!lanTls}
                        disabled={busy}
                        onClick={() => { if (lanTls) void save({ remoteLanTls: false }) }}
                      >
                        {t('transportPlain')}
                      </Button>
                      <Button
                        size="sm"
                        variant={lanTls ? 'primary' : 'ghost'}
                        className={css.modeButton}
                        role="radio"
                        aria-checked={lanTls}
                        disabled={busy}
                        onClick={() => { if (!lanTls) void save({ remoteLanTls: true }) }}
                      >
                        {t('transportTls')}
                      </Button>
                    </div>
                  </>
                ) : null}
                {enabled && mode === 'lan' && lanTls ? (
                  <p className={css.hint} role="note" data-dsh-remote-tls-hint="">
                    {t('lanTlsHint', { fp: (snap?.tlsFingerprint || '').slice(0, 16) })}
                  </p>
                ) : null}
                {enabled && mode === 'lan' && !lanTls && bindAddress !== '127.0.0.1' ? (
                  <p className={css.hint} role="note" data-dsh-remote-lan-warning="">{t('lanPlaintextWarning')}</p>
                ) : null}
                {enabled && mode === 'lan' && bindAddress === '127.0.0.1' ? (
                  <p className={css.hint} role="note" data-dsh-remote-loopback-hint="">{t('bindLoopbackHint')}</p>
                ) : null}
                <button
                  type="button"
                  className={css.devices}
                  onClick={() => { setDevicesOpen(true) }}
                >
                  <span>{t('devices')} {devices.length}</span>
                  <span className={css.devicesChevron} aria-hidden="true">
                    <IconChevronRightOutline14 />
                  </span>
                </button>
                {error ? <p className={css.status} role="status">{t('statusError', { message: error })}</p> : null}
                {enabled && qr ? (
                  <div className={css.qr} role="img" aria-label={t('qr')} dangerouslySetInnerHTML={{ __html: qr }} />
                ) : (
                  <p className={css.hint}>{enabled ? t('noQr') : t('offHint')}</p>
                )}
              </>
            )}
          </div>
          {devicesOpen ? (
            <div className={css.deviceLayer} role="presentation">
              <div className={css.mask} aria-hidden="true" onClick={() => { setDevicesOpen(false) }} />
              <div className={css.devicePanel} role="dialog" aria-modal="true" aria-label={t('devicesManage')}>
                <h2 className={css.heading}>{t('devicesManage')}</h2>
                {devices.length === 0 ? (
                  <p className={css.hint}>{t('devicesEmpty')}</p>
                ) : (
                  <ul className={css.deviceList}>
                    {devices.map(device => (
                      <li key={device.id} className={css.deviceRow}>
                        <div className={css.deviceMeta}>
                          <span className={css.deviceName}>
                            {device.name}
                            {device.online ? <span className={css.online}>{t('devicesOnline')}</span> : null}
                          </span>
                          {device.detail ? <span className={css.deviceDetail}>{device.detail}</span> : null}
                          {device.shortId ? <span className={css.deviceSeen}>{t('devicesId', { id: device.shortId })}</span> : null}
                          {device.createdAt ? (
                            <span className={css.deviceSeen}>
                              {t('devicesBound', { time: formatStamp(device.createdAt, t('devicesSeenUnknown')) })}
                            </span>
                          ) : null}
                          <span className={css.deviceSeen}>
                            {device.lastSeenAt
                              ? t('devicesSeen', { time: formatStamp(device.lastSeenAt, t('devicesSeenUnknown')) })
                              : t('devicesSeenUnknown')}
                          </span>
                        </div>
                        <button
                          type="button"
                          className={css.unbind}
                          disabled={busy}
                          onClick={() => { void unbind(device.id) }}
                        >
                          {t('unbind')}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
