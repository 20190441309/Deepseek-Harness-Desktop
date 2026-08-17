import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { FIT_SETTLE_MS, hostHasFitSize, PTY_RESIZE_DEBOUNCE_MS } from './fit.ts'
import { sessionBuffer, type TerminalSessionRecord } from './stores.ts'
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
  /** True when this pane is the shell's active session; xterm is focused then. */
  active: boolean
  /** Mark this pane's session active without moving DOM focus onto the chrome. */
  onActivate: () => void
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
 * FitAddon runs only after the host has a used box, then debounces PTY
 * resize. The active pane is focused. Selection offers Copy / Add to chat /
 * Open; ⌘/Ctrl-click activates links.
 * @param props - pane identity, replay buffer, PTY callbacks, and work-loop injects.
 * @returns the xterm host element and the selection action bar.
 */
export function TerminalPane({
  id, session, active, onActivate, onData, onResize, sessionId, cwd,
  mentionTerminal, writeClipboard, openWorkspacePath, openLocalUrl, openExternal, t,
}: TerminalPaneProps): ReactNode {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const termRef = useRef<Terminal | null>(null)
  /** Bytes of the replay buffer already written to the current terminal. */
  const writtenRef = useRef(0)
  const callbacksRef = useRef({
    onData, onResize, onActivate, cwd, mentionTerminal, writeClipboard, openWorkspacePath, openLocalUrl, openExternal,
  })
  callbacksRef.current = {
    onData, onResize, onActivate, cwd, mentionTerminal, writeClipboard, openWorkspacePath, openLocalUrl, openExternal,
  }
  const [selection, setSelection] = useState('')

  useEffect(() => {
    const host = hostRef.current
    /* v8 ignore next -- the host ref is attached on the div this effect reads. */
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
    const seed = sessionBuffer(session)
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
    let settleTimer = 0
    let resizeTimer = 0
    let pending: { cols: number; rows: number } | undefined
    let notified: { cols: number; rows: number } | undefined
    const notifyPty = (): void => {
      /* v8 ignore next -- the timer is only armed after pending is assigned. */
      if (pending === undefined) return
      if (notified !== undefined && notified.cols === pending.cols && notified.rows === pending.rows) return
      notified = pending
      callbacksRef.current.onResize(pending.cols, pending.rows)
    }
    const fitNow = (): void => {
      if (!hostHasFitSize(host)) return
      try {
        fit.fit()
      } catch {
        // FitAddon throws when the host is display:none; skip until it is shown.
        return
      }
      const cols = term.cols
      const rows = term.rows
      if (cols <= 0 || rows <= 0) return
      pending = { cols, rows }
      window.clearTimeout(resizeTimer)
      resizeTimer = window.setTimeout(notifyPty, PTY_RESIZE_DEBOUNCE_MS)
      term.scrollToBottom()
    }
    fitNow()
    raf = requestAnimationFrame(fitNow)
    settleTimer = window.setTimeout(fitNow, FIT_SETTLE_MS)
    const observer = typeof ResizeObserver === 'undefined'
      ? undefined
      : new ResizeObserver(() => {
        cancelAnimationFrame(raf)
        raf = requestAnimationFrame(fitNow)
      })
    observer?.observe(host)
    const fonts = host.ownerDocument.fonts
    fonts?.addEventListener('loadingdone', fitNow)
    termRef.current = term
    return () => {
      observer?.disconnect()
      cancelAnimationFrame(raf)
      window.clearTimeout(settleTimer)
      window.clearTimeout(resizeTimer)
      fonts?.removeEventListener('loadingdone', fitNow)
      disposeData.dispose()
      disposeSelection.dispose()
      disposeLinks.dispose()
      term.dispose()
      termRef.current = null
      writtenRef.current = 0
    }
    // The terminal instance is per-pane: rebuild when the pane id changes.
  }, [id])

  useEffect(() => {
    if (!active) return
    const term = termRef.current
    /* v8 ignore next -- the instance effect assigns termRef before this focus effect. */
    if (term === null) return
    const frame = requestAnimationFrame(() => { term.focus() })
    return () => { cancelAnimationFrame(frame) }
  }, [active, id])

  // Backfill output that arrived while this pane was unmounted (replay buffer).
  useEffect(() => {
    const term = termRef.current
    /* v8 ignore next -- backfill runs after the instance effect on the same commit. */
    if (term === null) return
    const buffer = sessionBuffer(session)
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
        onPointerDown={() => { callbacksRef.current.onActivate() }}
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
              /* v8 ignore next -- the button is disabled when sessionId is missing. */
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
