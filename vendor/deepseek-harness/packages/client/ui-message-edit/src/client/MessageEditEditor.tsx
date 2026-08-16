/**
 * Inline editor that replaces one finalized user bubble: a textarea in the
 * bubble chrome plus cancel/send. Confirm forks a child session cut before
 * that message, opens it, and submits the edited text. Escape cancels;
 * Enter sends (Shift+Enter inserts a newline), matching the composer.
 * @module @deepseek-ai/dsh-client-ui-message-edit/client/MessageEditEditor
 */

import { useCallback, useEffect, useRef, useState } from 'react'
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
 * @param props - the addressed user message, cancelEdit, and the resend/notify verbs.
 * @returns the editable bubble row.
 */
export function MessageEditEditor({
  seq, content, cancelEdit, resend, notify, t,
}: MessageEditEditorProps) {
  const initial = joinedText(content) ?? ''
  const [draft, setDraft] = useState(initial)
  const [pending, setPending] = useState(false)
  const alive = useRef(true)
  const composing = useRef(false)
  const fieldRef = useRef<HTMLTextAreaElement | null>(null)
  const empty = draft.trim() === ''
  const blocked = pending || empty

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

  const onChange = useCallback((event: ChangeEvent<HTMLTextAreaElement>) => {
    setDraft(event.target.value)
    fitHeight(event.target)
  }, [])

  const onSend = useCallback(() => {
    if (blocked) return
    setPending(true)
    void resend(seq, draft).catch(() => {
      notify(t('error.generic'))
      cancelEdit()
    }).finally(() => {
      if (alive.current) setPending(false)
    })
  }, [blocked, cancelEdit, draft, notify, resend, seq, t])

  const onKeyDown = useCallback((event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Escape') {
      if (!pending) cancelEdit()
      return
    }
    if (event.key === 'Enter' && event.shiftKey) return
    // keyCode 229 is the legacy IME-composition signal engines emit without isComposing.
    // oxlint-disable-next-line typescript/no-deprecated
    const ime = composing.current || event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229
    if (event.key !== 'Enter' || ime || event.repeat) return
    event.preventDefault()
    onSend()
  }, [cancelEdit, onSend, pending])

  return (
    <div className={css.row}>
      <div className={css.stack}>
        <div className={css.bubble}>
          <textarea
            ref={fieldRef}
            className={css.field}
            rows={1}
            value={draft}
            disabled={pending}
            aria-label={t('action.edit')}
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
        <Button variant="ghost" size="sm" disabled={pending} onClick={cancelEdit}>
          {t('action.cancel')}
        </Button>
        <Button variant="primary" size="sm" disabled={blocked} onClick={onSend}>
          {pending ? t('action.pending') : t('action.send')}
        </Button>
      </div>
    </div>
  )
}
