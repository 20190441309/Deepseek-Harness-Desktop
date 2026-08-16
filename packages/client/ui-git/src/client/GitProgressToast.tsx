/**
 * T3code-style git progress toast: top-right card with spinner, title,
 * elapsed subtitle, and dismiss. Stays up through hooks; success/error
 * replace the same card.
 * @module @deepseek-ai/dsh-client-ui-git/client/GitProgressToast
 */

import { IconCheckOutline16, IconCloseOutline16, IconWarningOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import { useEffect, useState } from 'react'
import { formatElapsedDescription } from './git-logic.ts'
import css from './GitProgressToast.module.css'

/** Visual tone of the progress card. */
export type GitProgressTone = 'loading' | 'success' | 'error'

/** Live git progress the titlebar owns. */
export interface GitProgressState {
  tone: GitProgressTone
  title: string
  description?: string | undefined
  details?: string
  startedAt: number | null
  actionLabel?: string
  onAction?: () => void
  copyLabel?: string
  detailsLabel?: string
  hideDetailsLabel?: string
}

/** Props for the floating git progress card. */
export interface GitProgressToastProps {
  state: GitProgressState
  dismissLabel: string
  onClose: () => void
}

/**
 * Render the top-right git progress card.
 * @param props - live state, dismiss copy, and close handler.
 * @returns the portaled-looking fixed card (owner already sits in the page).
 */
export function GitProgressToast({ state, dismissLabel, onClose }: GitProgressToastProps) {
  const [now, setNow] = useState(() => Date.now())
  const [expanded, setExpanded] = useState(false)
  useEffect(() => {
    if (state.tone !== 'loading') return
    const timer = window.setInterval(() => { setNow(Date.now()) }, 1000)
    return () => { window.clearInterval(timer) }
  }, [state.tone, state.startedAt])

  const subtitle = expanded && state.details
    ? state.details
    : state.description
      ?? (state.tone === 'loading' ? formatElapsedDescription(state.startedAt, now) : undefined)
  const copyText = state.details ?? state.description

  return (
    <div className={css.card} role="status" aria-live="polite" aria-label={state.title}>
      {state.tone === 'loading' && <span className={css.spinner} aria-hidden="true" />}
      {state.tone === 'success' && <IconCheckOutline16 size={16} />}
      {state.tone === 'error' && <IconWarningOutline16 size={16} />}
      <div className={css.copy}>
        <p className={css.title}>{state.title}</p>
        {subtitle !== undefined && (
          <p className={expanded ? css.subFull : css.sub}>{subtitle}</p>
        )}
        {state.actionLabel && state.onAction && (
          <button type="button" className={css.action} onClick={state.onAction}>
            {state.actionLabel}
          </button>
        )}
        {state.tone === 'error' && copyText && state.copyLabel && (
          <button
            type="button"
            className={css.action}
            onClick={() => { void navigator.clipboard.writeText(copyText) }}
          >
            {state.copyLabel}
          </button>
        )}
        {state.tone === 'error' && state.details && state.detailsLabel && (
          <button
            type="button"
            className={css.action}
            onClick={() => { setExpanded(next => !next) }}
          >
            {expanded ? (state.hideDetailsLabel ?? state.detailsLabel) : state.detailsLabel}
          </button>
        )}
      </div>
      <button type="button" className={css.close} aria-label={dismissLabel} onClick={onClose}>
        <IconCloseOutline16 size={12} />
      </button>
    </div>
  )
}
