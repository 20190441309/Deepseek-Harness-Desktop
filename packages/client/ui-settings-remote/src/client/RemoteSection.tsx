import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type { RemoteDevice, RemotePatch, RemoteSnapshot } from './desktop-shell.ts'
import { qrSvg } from './qr.ts'
import css from './RemoteSection.module.css'

/** Registration-side desktop callbacks used by the Remote popup. */
export interface RemoteSectionInjected {
  /** Read the current gateway snapshot. */
  getRemote: () => Promise<RemoteSnapshot | null>
  /** Persist a remote config patch and return the new snapshot. */
  saveRemote: (patch: RemotePatch) => Promise<RemoteSnapshot | null>
  /** Drop one bound phone; its cookie stops authorizing. */
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

function seenLabel(device: RemoteDevice, t: RemoteSectionProps['t']): string {
  if (!device.lastSeenAt) return t('devicesSeenUnknown')
  const stamp = Date.parse(device.lastSeenAt)
  if (!Number.isFinite(stamp)) return t('devicesSeenUnknown')
  return t('devicesSeen', { time: new Date(stamp).toLocaleString() })
}

/**
 * Sidebar-foot Remote control: a phone trigger plus a popup with on/off,
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
    setBusy(true)
    try {
      applySnap(await saveRemote(patch))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setBusy(false)
    }
  }, [applySnap, saveRemote])

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

  return (
    <div className={wide ? css.layer : `${css.layer} ${css.rail}`}>
      <button
        type="button"
        className={css.trigger}
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
                <label className={css.switch}>
                  <input
                    type="checkbox"
                    role="switch"
                    checked={enabled}
                    disabled={busy}
                    aria-label={t('enable')}
                    onChange={(event) => { void save({ remoteEnabled: event.target.checked }) }}
                  />
                  {enabled ? t('enabledOn') : t('enabledOff')}
                </label>
                <div className={css.modes} role="radiogroup" aria-label={t('mode')}>
                  <label className={mode === 'lan' ? css.modeOn : undefined}>
                    <input
                      type="radio"
                      name="dsh-remote-mode"
                      checked={mode === 'lan'}
                      disabled={busy}
                      onChange={() => { void save({ remoteMode: 'lan' }) }}
                    />
                    {t('modeLan')}
                  </label>
                  <label className={mode === 'relay' ? css.modeOn : undefined}>
                    <input
                      type="radio"
                      name="dsh-remote-mode"
                      checked={mode === 'relay'}
                      disabled={busy}
                      onChange={() => { void save({ remoteMode: 'relay' }) }}
                    />
                    {t('modeRelay')}
                  </label>
                </div>
                <button
                  type="button"
                  className={css.devices}
                  onClick={() => { setDevicesOpen(true) }}
                >
                  {t('devices')} {devices.length}
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
                    {devices.map((device) => (
                      <li key={device.id} className={css.deviceRow}>
                        <div className={css.deviceMeta}>
                          <span className={css.deviceName}>
                            {device.name}
                            {device.online ? <span className={css.online}>{t('devicesOnline')}</span> : null}
                          </span>
                          <span className={css.deviceSeen}>{seenLabel(device, t)}</span>
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
