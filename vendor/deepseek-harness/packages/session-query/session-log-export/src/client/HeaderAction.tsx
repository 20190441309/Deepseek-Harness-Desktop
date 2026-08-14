import type { ReactNode } from 'react'
import { IconDownloadOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import { SessionLogDownloadDialog, type SessionLogDownloadDialogProps } from './Dialog.tsx'
import css from './HeaderAction.module.css'

/**
 * Render the titlebar Session log capsule and its shared result dialog.
 * @param props - Root runtime seats, download controller, and localized dialog copy.
 * @returns the titlebar action and current-session dialog, or nothing when no session is selected.
 */
export function SessionLogDownloadHeaderAction(props: SessionLogDownloadDialogProps): ReactNode {
  const { useSessions, useSessionLogDownload, request } = props
  const sessionId = useSessions(s => s.current)
  if (sessionId === undefined) return null

  const entry = useSessionLogDownload(state => state.bySession[String(sessionId)])
  const busy = entry?.status === 'downloading'

  return (
    <>
      <button
        type="button"
        className={css.sessionLogButton}
        disabled={busy}
        aria-busy={busy}
        onClick={() => { void request(sessionId) }}
      >
        <span>Session log</span>
        <IconDownloadOutline16 size={12} />
      </button>
      <SessionLogDownloadDialog {...props} sessionId={sessionId} />
    </>
  )
}
