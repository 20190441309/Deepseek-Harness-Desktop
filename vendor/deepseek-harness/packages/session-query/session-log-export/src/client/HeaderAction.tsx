import type { ReactNode } from 'react'
import { IconDownloadOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import { SessionLogDownloadDialog, type SessionLogDownloadDialogProps } from './Dialog.tsx'
import css from './HeaderAction.module.css'

/**
 * Render the titlebar Session log capsule and its shared result dialog.
 * @param props - Root runtime seats, download controller, and localized dialog copy.
 * @returns the titlebar action (when shown) and current-session dialog, or nothing when no session is selected.
 */
export function SessionLogDownloadHeaderAction(props: SessionLogDownloadDialogProps): ReactNode {
  const { useSessions, useSessionLogDownload, useTitlebarAction, request, density = 'full' } = props
  const sessionId = useSessions(s => s.current)
  const showButton = useTitlebarAction(value => value)
  const entry = useSessionLogDownload(state =>
    sessionId === undefined ? undefined : state.bySession[String(sessionId)])
  if (sessionId === undefined) return null

  const busy = entry?.status === 'downloading'
  const iconOnly = density !== 'full'

  return (
    <>
      {showButton ? (
        <button
          type="button"
          className={iconOnly ? `${css.sessionLogButton} ${css.iconOnly}` : css.sessionLogButton}
          disabled={busy}
          aria-busy={busy}
          aria-label="Session log"
          onClick={() => { void request(sessionId) }}
        >
          {iconOnly ? null : <span>Session log</span>}
          <IconDownloadOutline16 size={iconOnly ? 14 : 12} />
        </button>
      ) : null}
      <SessionLogDownloadDialog {...props} sessionId={sessionId} />
    </>
  )
}
