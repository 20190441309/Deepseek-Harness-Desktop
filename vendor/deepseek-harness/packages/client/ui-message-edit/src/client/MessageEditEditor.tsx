/**
 * Inline editor that replaces one finalized user bubble: a textarea in the
 * bubble chrome plus cancel/send. Confirm forks a child session cut before
 * that message, opens it, and submits the edited text. Escape cancels;
 * Enter sends (Shift+Enter inserts a newline), matching the composer.
 * Send stays blocked — with the reason spelled out next to the buttons —
 * while the source session is running or a newer user message arrived
 * mid-edit (the latest-message-only product rule holds through the whole
 * transaction, not just at the pencil). A failed resend keeps the editor
 * armed with the draft so the operator can retry or cancel; cancel hands
 * focus back to the pencil through the shared store.
 * @module @deepseek-ai/dsh-client-ui-message-edit/client/MessageEditEditor
 */

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import type { ChangeEvent, KeyboardEvent } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import { joinedText } from './text.ts'
import type { MessageEditEditorProps } from './slots.ts'
import css from './MessageEditEditor.module.css'

/**
 * Grow the textarea to its scroll height without animating layout.
 * @param el - the live textarea.
 */
function fitHeight(el: HTMLTextAreaElement): void {
  el.style.height = 'auto'
  el.style.height = `${el.scrollHeight}px`
}

/**
 * One message's inline editor.
 * @param props - the addressed user message, cancelEdit, the resend/notify
 * verbs, the session snapshot hook, and the shared interaction store.
 * @returns the editable bubble row.
 */
export function MessageEditEditor({
  seq, content, cancelEdit, resend, notify, useSession, actions, t,
}: MessageEditEditorProps) {
  const initial = joinedText(content) ?? ''
  const [draft, setDraft] = useState(initial)
  const [pending, setPending] = useState(false)
  // Failed-resend counter: each failure re-arms the editor and drives the
  // retry refocus effect below.
  const [failures, setFailures] = useState(0)
  const alive = useRef(true)
  const composing = useRef(false)
  const fieldRef = useRef<HTMLTextAreaElement | null>(null)
  const running = useSession(snapshot => snapshot.running)
  const stale = useSession(snapshot => snapshot.nodes.findLast(node => node.kind === 'user')?.seq !== seq)
  const empty = draft.trim() === ''
  // Mid-edit state guard: entering edit mode required an idle session and the
  // latest user message; both can stop holding while the editor is open
  // (a queued message admits, another client submits). Sending then would
  // fork a cut that silently drops the newer turns, so it stays blocked with
  // the reason announced beside the buttons.
  const guard = stale ? t('editor.hint.stale') : running ? t('editor.hint.running') : null
  const blocked = pending || empty || guard !== null
  const guardId = useId()

  useEffect(() => () => { alive.current = false }, [])

  useEffect(() => {
    const el = fieldRef.current
    /* v8 ignore next -- the textarea renders unconditionally; the ref is set before this layout effect. */
    if (el === null) return
    el.focus()
    const end = el.value.length
    el.setSelectionRange(end, end)
    fitHeight(el)
  }, [])

  // Refit on width changes (window or panel resize): the fitted height derives
  // from soft wrapping at the current width, which typing alone cannot track.
  useEffect(() => {
    const el = fieldRef.current
    /* v8 ignore next -- the textarea renders unconditionally; the ref is set before this effect. */
    if (el === null) return
    let width = el.offsetWidth
    const observer = new ResizeObserver((entries) => {
      const next = entries.at(-1)?.contentRect.width
      if (next === undefined || next === width) return
      width = next
      fitHeight(el)
    })
    observer.observe(el)
    return () => { observer.disconnect() }
  }, [])

  // After a failed resend the field re-enables with the draft intact; hand
  // focus back so retry or Escape needs no pointer trip. Runs after the
  // re-render that lifted the disabled attribute.
  useEffect(() => {
    if (failures === 0) return
    fieldRef.current?.focus()
  }, [failures])

  const onChange = useCallback((event: ChangeEvent<HTMLTextAreaElement>) => {
    setDraft(event.target.value)
    fitHeight(event.target)
  }, [])

  const onCancel = useCallback(() => {
    // Ask the remounted pencil to take focus before the bubble swap removes
    // this textarea (the editor and the pencil never coexist in the DOM).
    actions.requestReturnFocus(seq)
    cancelEdit()
  }, [actions, cancelEdit, seq])

  const onSend = useCallback(() => {
    if (blocked) return
    setPending(true)
    void resend(seq, draft).then(() => {
      // Success unmounts this editor with the source view (the child session
      // opened); the guard only covers a still-mounted tail.
      if (alive.current) setPending(false)
    }, () => {
      if (!alive.current) return
      notify(t('error.generic'))
      // Stay in the editor: the draft is the operator's work — a failed fork
      // must not discard it. Cancel remains one Escape away.
      setPending(false)
      setFailures(count => count + 1)
    })
  }, [blocked, draft, notify, resend, seq, t])

  const onKeyDown = useCallback((event: KeyboardEvent<HTMLTextAreaElement>) => {
    // keyCode 229 is the legacy IME-composition signal engines emit without isComposing.
    // oxlint-disable-next-line typescript/no-deprecated
    const ime = composing.current || event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229
    if (event.key === 'Escape') {
      // A composition Escape only dismisses the IME candidate list; it must
      // not discard the whole edit.
      if (!pending && !ime) onCancel()
      return
    }
    if (event.key === 'Enter' && event.shiftKey) return
    if (event.key !== 'Enter' || ime || event.repeat) return
    event.preventDefault()
    onSend()
  }, [onCancel, onSend, pending])

  return (
    <div className={css.row} aria-busy={pending || undefined}>
      <div className={css.stack}>
        <div className={css.bubble}>
          <textarea
            ref={fieldRef}
            className={css.field}
            rows={1}
            value={draft}
            disabled={pending}
            aria-label={t('editor.field')}
            aria-describedby={guard === null ? undefined : guardId}
            onChange={onChange}
            onKeyDown={onKeyDown}
            onCompositionStart={() => { composing.current = true }}
            onCompositionEnd={() => {
              window.setTimeout(() => { composing.current = false }, 10)
            }}
          />
        </div>
      </div>
      <div className={css.actions}>
        {guard !== null && <span id={guardId} className={css.guard} role="status">{guard}</span>}
        <Button variant="ghost" size="sm" disabled={pending} aria-keyshortcuts="Escape" onClick={onCancel}>
          {t('action.cancel')}
        </Button>
        <Button variant="primary" size="sm" disabled={blocked} aria-keyshortcuts="Enter" onClick={onSend}>
          {pending ? t('action.pending') : t('action.send')}
        </Button>
      </div>
    </div>
  )
}
