/**
 * Latest-user-message edit control: a pencil in the user message's IconActions
 * row that asks the owning bubble to enter inline-edit mode. Only the newest
 * user message in the transcript arms the button; historical messages render
 * nothing here. The fork/resend transaction lives on the editor, not here.
 * @module @deepseek-ai/dsh-client-ui-message-edit/client/MessageEditAction
 */

import { useCallback, useId } from 'react'
import { IconEditOutline16, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import { joinedText } from './text.ts'
import type { MessageEditActionProps } from './slots.ts'
import css from './MessageEditAction.module.css'

/**
 * One message's edit control.
 * @param props - the addressed user message, startEdit, and the session snapshot hook.
 * @returns the pencil action, or nothing when this is not the latest user message.
 */
export function MessageEditAction({ seq, content, startEdit, useSession, t }: MessageEditActionProps) {
  const latest = useSession(snapshot => snapshot.nodes.findLast(node => node.kind === 'user')?.seq === seq)
  const running = useSession(snapshot => snapshot.running)
  const reasonId = useId()

  const textOnly = joinedText(content) !== null
  const unavailable = running || !textOnly
  const label = running
    ? t('action.running')
    : !textOnly
      ? t('action.unsupported')
      : t('action.edit')

  const onEdit = useCallback(() => {
    if (unavailable) return
    startEdit()
  }, [startEdit, unavailable])

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
          onClick={onEdit}
        >
          <IconEditOutline16 />
        </button>
      </Tooltip>
      {unavailable && <span id={reasonId} className={css.visuallyHidden}>{label}</span>}
    </>
  )
}
