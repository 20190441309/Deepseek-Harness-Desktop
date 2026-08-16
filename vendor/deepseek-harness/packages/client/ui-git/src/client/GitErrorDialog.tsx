/**
 * Git failure dialog: a short headline plus a capped, scrollable log.
 * Hook dumps stay inside the card instead of stretching the page.
 * @module @deepseek-ai/dsh-client-ui-git/client/GitErrorDialog
 */

import { Button, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import css from './GitErrorDialog.module.css'

/** Props for the git error dialog. */
export interface GitErrorDialogProps {
  open: boolean
  title: string
  closeLabel: string
  message: string
  onClose: () => void
}

/**
 * Split a git/hook dump into a one-line headline and the full log.
 * @param message - raw stderr/stdout from a failed git command.
 * @returns headline plus the original text when it has more than one line.
 */
export function splitGitError(message: string): { headline: string; detail: string | null } {
  const lines = message.split(/\r?\n/).map(line => line.trim()).filter(Boolean)
  if (lines.length === 0) return { headline: message, detail: null }
  const marked = lines.find(line => /hook|failed|error|Format issues/i.test(line))
  const headline = marked ?? lines[0] ?? message
  return {
    headline,
    detail: lines.length > 1 ? message : null,
  }
}

/**
 * Render the git failure dialog.
 * @param props - open state, copy, and close handler.
 * @returns the modal.
 */
export function GitErrorDialog({ open, title, closeLabel, message, onClose }: GitErrorDialogProps) {
  const { headline, detail } = splitGitError(message)

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      closeLabel={closeLabel}
      description={headline}
      className={css.dialog}
      footer={(
        <Button variant="primary" size="sm" onClick={onClose}>
          {closeLabel}
        </Button>
      )}
    >
      {detail !== null && (
        <pre className={css.log}>{detail}</pre>
      )}
    </Modal>
  )
}
