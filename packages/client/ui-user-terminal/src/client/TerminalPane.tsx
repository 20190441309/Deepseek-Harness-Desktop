import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import type { TerminalSessionRecord } from './stores.ts'
import {
  activateTerminalTarget,
  extractTerminalLinks,
  isTerminalLinkActivation,
  linksOnBufferLine,
  type TerminalLinkMatch,
} from './links.ts'
import { NS } from './locales.ts'
import { normalizeSelection } from './selection.ts'
import type { TerminalShellInjected } from './shell.ts'
import { readXtermFont, readXtermTheme } from './terminal-theme.ts'
import css from './TerminalWorkspace.module.css'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'

export interface TerminalPaneProps {
  /** The PTY session id backing this pane. */
  id: string
  /** Session record whose replay buffer seeds and backfills the terminal. */
  session?: TerminalSessionRecord | undefined
  /** Forward terminal input to the PTY. */
  onData: (bytes: string) => void
  /** Report the fitted geometry so the PTY can be resized. */
  onResize: (cols: number, rows: number) => void
  /** Current session id for composer writes; missing is a no-op. */
  sessionId: string | undefined
  /** Session cwd used to resolve relative path links. */
  cwd: string | undefined
  mentionTerminal: TerminalShellInjected['mentionTerminal']
  writeClipboard: TerminalShellInjected['writeClipboard']
  openWorkspacePath: TerminalShellInjected['openWorkspacePath']
  openLocalUrl: TerminalShellInjected['openLocalUrl']
  openExternal: TerminalShellInjected['openExternal']
  t: PropsLocale<typeof NS>['t']
}

interface XtermLink {
  range: { start: { x: number; y: number }; end: { x: number; y: number } }
  text: string
  activate: (event: MouseEvent, text: string) => void
}

interface XtermBufferLine {
  isWrapped?: boolean
  translateToString: (trimRight?: boolean) => string
}

/**
 * One interactive pane: an xterm instance over a PTY. The store's replay
 * buffer seeds the terminal on mount and backfills it incrementally, so a
 * remount (drawer/surface switch) never loses output; live output flows
 * straight from the PTY data listener into xterm and the buffer together.
 * Selection offers Copy / Add to chat / Open; ⌘/Ctrl-click activates links.
 * @param props - pane identity, replay buffer, PTY callbacks, and work-loop injects.
 * @returns the xterm host element and the selection action bar.
 */
export function TerminalPane({
  id, session, onData, onResize, sessionId, cwd,
  mentionTerminal, writeClipboard, openWorkspacePath, openLocalUrl, openExternal, t,
}: TerminalPaneProps): ReactNode {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const termRef = useRef<Terminal | null>(null)
  /** Bytes of the replay buffer already written to the current terminal. */
  const writtenRef = useRef(0)
  const callbacksRef = useRef({
    onData, onResize, cwd, mentionTerminal, writeClipboard, openWorkspacePath, openLocalUrl, openExternal,
  })
  callbacksRef.current = {
    onData, onResize, cwd, mentionTerminal, writeClipboard, openWorkspacePath, openLocalUrl, openExternal,
  }
  const [selection, setSelection] = useState('')

  useEffect(() => {
    const host = hostRef.current
    if (host === null) return
    const font = readXtermFont(host)
    const term = new Terminal({
      fontFamily: font.fontFamily,
      fontSize: font.fontSize,
      lineHeight: font.lineHeight,
      cursorBlink: true,
      cursorStyle: 'bar',
      scrollback: 2000,
      allowProposedApi: false,
      theme: readXtermTheme(host),
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(host)
    const seed = session?.buffer ?? ''
    if (seed.length > 0) term.write(seed)
    writtenRef.current = seed.length
    const disposeData = term.onData((bytes) => { callbacksRef.current.onData(bytes) })
    const disposeSelection = term.onSelectionChange(() => {
      setSelection(normalizeSelection(term.getSelection()))
    })
    const disposeLinks = term.registerLinkProvider({
      provideLinks(bufferLineNumber: number, callback: (links: XtermLink[] | undefined) => void) {
        const matches = linksOnBufferLine(
          bufferLineNumber,
          index => term.buffer.active.getLine(index) as XtermBufferLine | undefined,
        )
        if (matches.length === 0) {
          callback(undefined)
          return
        }
        callback(matches.map((match) => ({
          text: match.text,
          range: match.range,
          activate: (event, linkText) => {
            if (!isTerminalLinkActivation(event)) return
            activateTerminalTarget(linkText, callbacksRef.current.cwd, callbacksRef.current)
          },
        })))
      },
    })
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
      disposeSelection.dispose()
      disposeLinks.dispose()
      term.dispose()
      termRef.current = null
      writtenRef.current = 0
    }
    // The terminal instance is per-pane: rebuild when the pane id changes.
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

  const link: TerminalLinkMatch | undefined = selection.length === 0
    ? undefined
    : extractTerminalLinks(selection)[0]
  const openLabel = link?.kind === 'url' ? t('action.openLink') : t('action.openPath')

  return (
    <div className={css.paneTerminalWrap}>
      <div
        ref={hostRef}
        className={css.paneTerminal}
        data-terminal-pane={id}
        role="log"
        aria-label={id}
        onClick={(event) => { event.stopPropagation() }}
      />
      {selection.length > 0 ? (
        <div className={css.selectionBar} role="toolbar" aria-label={t('action.addToChat')}>
          <button
            type="button"
            className={css.selectionAction}
            onClick={() => { void writeClipboard(selection) }}
          >
            {t('action.copy')}
          </button>
          <button
            type="button"
            className={css.selectionAction}
            disabled={sessionId === undefined}
            onClick={() => {
              if (sessionId === undefined) return
              mentionTerminal(sessionId, selection)
              termRef.current?.clearSelection()
              setSelection('')
            }}
          >
            {t('action.addToChat')}
          </button>
          {link !== undefined ? (
            <button
              type="button"
              className={css.selectionAction}
              onClick={() => {
                activateTerminalTarget(selection, cwd, { openLocalUrl, openWorkspacePath, openExternal })
              }}
            >
              {openLabel}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
