import { useEffect, useRef, useState } from 'react'
import type { ChatMessage } from '../api/fold.ts'
import type { Copy } from '../locale.ts'

type Props = {
  t: Copy
  title: string
  messages: ChatMessage[]
  sending: boolean
  loading: boolean
  error: string
  empty: boolean
  drawerOpen: boolean
  onToggleDrawer: () => void
  onSend: (text: string) => void
}

export function ChatPage({
  t, title, messages, sending, loading, error, empty, drawerOpen, onToggleDrawer, onSend,
}: Props) {
  const [draft, setDraft] = useState('')
  const end = useRef<HTMLDivElement>(null)

  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' })
  }, [messages, sending])

  const submit = (): void => {
    const text = draft.trim()
    if (!text || sending || empty) {
      return
    }
    setDraft('')
    onSend(text)
  }

  return (
    <div className="app">
      <header className="top">
        <h1>{empty ? t.emptyTitle : title}</h1>
        <button
          type="button"
          className="icon-btn"
          onClick={onToggleDrawer}
          aria-label={t.menu}
          aria-expanded={drawerOpen}
        >
          <MenuIcon />
        </button>
      </header>
      <div className="scroll">
        {empty && !loading ? (
          <p className="empty pad">{t.emptyHint}</p>
        ) : (
          <div className="thread">
            {loading ? <p className="lead">{t.loadingHistory}</p> : null}
            {messages.map((message) => (
              <div key={message.id} className={`bubble ${message.role}`}>{message.text}</div>
            ))}
            {sending ? <div className="bubble assistant">{t.sending}</div> : null}
            {error ? <p className="err">{error}</p> : null}
            <div ref={end} />
          </div>
        )}
      </div>
      <form
        className="composer"
        onSubmit={(event) => {
          event.preventDefault()
          submit()
        }}
      >
        <textarea
          value={draft}
          rows={1}
          placeholder={t.placeholder}
          enterKeyHint="send"
          disabled={empty}
          onChange={(event) => { setDraft(event.target.value) }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              submit()
            }
          }}
        />
        <button type="submit" className="send" disabled={empty || sending || !draft.trim()}>{t.send}</button>
      </form>
    </div>
  )
}

function MenuIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
      <path d="M4 6.5h14M4 11h14M4 15.5h14" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  )
}
