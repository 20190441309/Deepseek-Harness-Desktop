import { useState } from 'react'
import type { SessionRow } from '../api/client.ts'
import type { Copy } from '../locale.ts'

type Props = {
  t: Copy
  session: SessionRow | null
  onClose: () => void
  onRename: (session: SessionRow, title: string) => void
  onFork: (session: SessionRow) => void
  onArchive: (session: SessionRow) => void
}

export function SessionMenu({ t, session, onClose, onRename, onFork, onArchive }: Props) {
  const [renaming, setRenaming] = useState(false)
  const [title, setTitle] = useState(session?.title || '')

  if (!session) {
    return null
  }

  if (renaming) {
    return (
      <div className="sheet-mask" onClick={onClose}>
        <form
          className="dialog"
          onClick={(event) => { event.stopPropagation() }}
          onSubmit={(event) => {
            event.preventDefault()
            const next = title.trim()
            if (next) {
              onRename(session, next)
            }
          }}
        >
          <h2>{t.renameTitle}</h2>
          <input
            className="search"
            value={title}
            autoFocus
            onChange={(event) => { setTitle(event.target.value) }}
          />
          <div className="dialog-actions">
            <button type="button" className="ghost" onClick={onClose}>{t.cancel}</button>
            <button type="submit" className="send">{t.save}</button>
          </div>
        </form>
      </div>
    )
  }

  return (
    <div className="sheet-mask" onClick={onClose}>
      <div className="sheet" role="menu" onClick={(event) => { event.stopPropagation() }}>
        <button type="button" className="sheet-item" role="menuitem" onClick={() => {
          setTitle(session.title)
          setRenaming(true)
        }}>
          <RenameIcon />
          {t.rename}
        </button>
        <button type="button" className="sheet-item" role="menuitem" onClick={() => { onFork(session) }}>
          <ForkIcon />
          {t.fork}
        </button>
        <button type="button" className="sheet-item" role="menuitem" onClick={() => { onArchive(session) }}>
          <ArchiveIcon />
          {t.archive}
        </button>
      </div>
    </div>
  )
}

function RenameIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path d="M3.5 14.5 12.2 5.8l1.5 1.5L5 16H3.5zM13.1 4.9l1.1-1.1a1 1 0 0 1 1.4 0l.7.7a1 1 0 0 1 0 1.4l-1.1 1.1z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  )
}

function ForkIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <circle cx="5" cy="4" r="1.6" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="13" cy="4" r="1.6" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="9" cy="14" r="1.6" stroke="currentColor" strokeWidth="1.4" />
      <path d="M5 5.6v2.2c0 1.4 1.2 2.4 2.6 2.4H9M13 5.6v2.2c0 1.4-1.2 2.4-2.6 2.4H9v2" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  )
}

function ArchiveIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <rect x="2.5" y="3.5" width="13" height="3.2" rx="0.8" stroke="currentColor" strokeWidth="1.4" />
      <path d="M4 6.7V14a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V6.7M7.2 10h3.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}
