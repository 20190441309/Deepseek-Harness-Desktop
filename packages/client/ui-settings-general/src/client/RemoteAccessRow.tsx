/** Desktop-only General row: enable remote pairing and revoke devices. */
import { useEffect, useState } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import { desktopShell, type RemoteAccessStatus } from './desktop-shell.ts'
import css from './RemoteAccessRow.module.css'

/** Full Settings-row props. */
export type RemoteAccessRowProps =
  PropsRuntime<'settings.general.item'>
  & PropsLocale<'settings'>

const EMPTY: RemoteAccessStatus = {
  enabled: false,
  connected: false,
  pairingUrl: null,
  qrDataUrl: null,
  devices: [],
}

/**
 * Render the remote-access pairing controls.
 * @param props - composed Settings slot props.
 * @returns the preference row.
 */
export function RemoteAccessRow({ t }: RemoteAccessRowProps) {
  const [status, setStatus] = useState<RemoteAccessStatus>(EMPTY)
  const [copied, setCopied] = useState(false)
  const shell = desktopShell()

  useEffect(() => {
    let cancelled = false
    void shell?.getRemoteAccess?.().then((next) => {
      if (!cancelled && next) setStatus(next)
    }).catch(() => {
      // Keep the disabled default when the desktop sidecar cannot be read.
    })
    return () => { cancelled = true }
  }, [shell])

  const enabled = Boolean(status.enabled)

  return (
    <div className={css.row}>
      <div className={css.head}>
        <div className={css.rowText}>
          <div className={css.title}>{t('remoteAccess.title')}</div>
          <div className={css.desc}>{t('remoteAccess.description')}</div>
        </div>
        <button
          type="button"
          className={css.toggle}
          onClick={() => {
            void shell?.setRemoteEnabled?.(!enabled).then((next) => {
              if (next) setStatus(next)
            })
          }}
        >
          {t(enabled ? 'remoteAccess.disable' : 'remoteAccess.enable')}
        </button>
      </div>
      {enabled ? (
        <div className={css.panel}>
          <div className={css.desc}>
            {t(status.connected ? 'remoteAccess.online' : 'remoteAccess.offline')}
          </div>
          {status.qrDataUrl ? (
            <img className={css.qr} src={status.qrDataUrl} alt={t('remoteAccess.title')} />
          ) : null}
          {status.pairingUrl ? <div className={css.link}>{status.pairingUrl}</div> : null}
          <div className={css.actions}>
            <button
              type="button"
              className={css.toggle}
              onClick={() => {
                if (!status.pairingUrl) return
                void navigator.clipboard?.writeText(status.pairingUrl).then(() => {
                  setCopied(true)
                }).catch(() => {
                  // Clipboard can be missing in tests; the URL stays visible.
                })
              }}
            >
              {t(copied ? 'remoteAccess.copied' : 'remoteAccess.copy')}
            </button>
          </div>
          <div className={css.title}>{t('remoteAccess.devices')}</div>
          {(status.devices ?? []).length === 0 ? (
            <div className={css.desc}>{t('remoteAccess.empty')}</div>
          ) : (status.devices ?? []).map(device => (
            <div className={css.device} key={device.deviceId}>
              <span>{device.label || device.deviceId}</span>
              <button
                type="button"
                className={css.toggle}
                onClick={() => {
                  void shell?.revokeRemoteDevice?.(device.deviceId).then((next) => {
                    if (next) setStatus(next)
                  })
                }}
              >
                {t('remoteAccess.revoke')}
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}
