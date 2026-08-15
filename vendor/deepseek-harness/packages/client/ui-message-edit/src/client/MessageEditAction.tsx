/**
 * Latest-user-message edit control: a pencil in the user message's IconActions
 * row that forks a child session cut before that message, opens it, and prefills
 * the composer with the original text. Only the newest user message in the
 * transcript arms the button; historical messages render nothing here.
 * @module @deepseek-ai/dsh-client-ui-message-edit/client/MessageEditAction
 */

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { IconEditOutline16, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { MessageEditActionProps } from './slots.ts'
import css from './MessageEditAction.module.css'

/**
 * One message's edit control.
 * @param props - the addressed user message, the injected fork/prefill verbs,
 * and the session snapshot hook.
 * @returns the pencil action, or nothing when this is not the latest user message.
 */
export function MessageEditAction({ seq, content, edit, notify, useSession, t }: MessageEditActionProps) {
  const latest = useSession(snapshot => snapshot.nodes.findLast(node => node.kind === 'user')?.seq === seq)
  const running = useSession(snapshot => snapshot.running)
  const [pending, setPending] = useState(false)
  const alive = useRef(true)
  const reasonId = useId()

  useEffect(() => () => { alive.current = false }, [])

  const textOnly = content.every(block => block.type === 'text')
  const text = textOnly
    ? content.map(block => block.type === 'text' ? block.text : '').join('')
    : ''
  const unavailable = running || !textOnly || pending
  const label = pending
    ? t('action.pending')
    : running
      ? t('action.running')
      : !textOnly
        ? t('action.unsupported')
        : t('action.edit')

  const onEdit = useCallback(() => {
    if (unavailable) return
    setPending(true)
    void edit(seq, text).catch(() => {
      notify(t('error.generic'))
    }).finally(() => {
      if (alive.current) setPending(false)
    })
  }, [edit, notify, seq, t, text, unavailable])

  if (!latest) return null
  return (
    <>
      <Tooltip label={label} side="bottom">
        {/* A native disabled button would drop the hover/focus events Tooltip needs. */}
        <button
          type="button"
          className={css.action}
          aria-label={t('action.edit')}
          aria-disabled={unavailable || undefined}
          aria-describedby={unavailable ? reasonId : undefined}
          data-unavailable={unavailable || undefined}
          onClick={unavailable ? undefined : onEdit}
        >
          <IconEditOutline16 />
        </button>
      </Tooltip>
      {unavailable && <span id={reasonId} className={css.visuallyHidden}>{label}</span>}
    </>
  )
}
