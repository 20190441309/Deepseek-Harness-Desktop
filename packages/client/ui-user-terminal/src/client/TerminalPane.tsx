import { useEffect, useRef, type ReactNode } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import type { TerminalSessionRecord } from './stores.ts'
import css from './TerminalWorkspace.module.css'

export interface TerminalPaneProps {
  /** The PTY session id backing this pane. */
  id: string
  /** Session record whose replay buffer seeds and backfills the terminal. */
  session?: TerminalSessionRecord | undefined
  /** Forward terminal input to the PTY. */
  onData: (bytes: string) => void
  /** Report the fitted geometry so the PTY can be resized. */
  onResize: (cols: number, rows: number) => void
}

/**
 * One interactive pane: an xterm instance over a PTY. The store's replay
 * buffer seeds the terminal on mount and backfills it incrementally, so a
 * remount (drawer/surface switch) never loses output; live output flows
 * straight from the PTY data listener into xterm and the buffer together.
 * @param props - pane identity, replay buffer, and PTY callbacks.
 * @returns the xterm host element.
 */
export function TerminalPane({ id, session, onData, onResize }: TerminalPaneProps): ReactNode {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const termRef = useRef<Terminal | null>(null)
  /** Bytes of the replay buffer already written to the current terminal. */
  const writtenRef = useRef(0)
  const callbacksRef = useRef({ onData, onResize })
  callbacksRef.current = { onData, onResize }

  useEffect(() => {
    const host = hostRef.current
    if (host === null) return
    const term = new Terminal({
      fontFamily: 'var(--dsw-font-family, monospace)',
      fontSize: 13,
      lineHeight: 1.4,
      cursorBlink: true,
      scrollback: 2000,
      allowProposedApi: false,
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(host)
    const seed = session?.buffer ?? ''
    if (seed.length > 0) term.write(seed)
    writtenRef.current = seed.length
    const disposeData = term.onData(bytes => { callbacksRef.current.onData(bytes) })
    let raf = 0
    const fitNow = (): void => {
      try {
        fit.fit()
      } catch {
        // A hidden/zero-size host (drawer collapsed) cannot fit; skip.
        return
      }
      const cols = term.cols
      const rows = term.rows
      if (cols > 0 && rows > 0) callbacksRef.current.onResize(cols, rows)
    }
    fitNow()
    const observer = typeof ResizeObserver === 'undefined'
      ? undefined
      : new ResizeObserver(() => {
        cancelAnimationFrame(raf)
        raf = requestAnimationFrame(fitNow)
      })
    observer?.observe(host)
    termRef.current = term
    return () => {
      observer?.disconnect()
      cancelAnimationFrame(raf)
      disposeData.dispose()
      term.dispose()
      termRef.current = null
      writtenRef.current = 0
    }
    // The terminal instance is per-pane: rebuild when the pane id changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  // Backfill output that arrived while this pane was unmounted (replay buffer).
  useEffect(() => {
    const term = termRef.current
    if (term === null) return
    const buffer = session?.buffer ?? ''
    if (buffer.length > writtenRef.current) {
      term.write(buffer.slice(writtenRef.current))
      writtenRef.current = buffer.length
    }
  }, [session?.buffer])

  return (
    <div
      ref={hostRef}
      className={css.paneTerminal}
      data-terminal-pane={id}
      role="log"
      aria-label={id}
      onClick={(event) => { event.stopPropagation() }}
    />
  )
}
