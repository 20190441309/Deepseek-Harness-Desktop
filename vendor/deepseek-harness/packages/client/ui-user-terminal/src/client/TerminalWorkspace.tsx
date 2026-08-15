import { useCallback, useEffect, useRef, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import clsx from 'clsx'
import {
  IconFullscreenOutline16,
  IconPlusOutline16,
  IconSplitOutline16,
  IconTrashOutline16,
  Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import type { PropsLocale, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import { cwdFromSessions } from './cwd.ts'
import { clampDrawerHeight, maxDrawerHeight, TERMINAL_DRAWER_DEFAULT } from './height.ts'
import { NS } from './locales.ts'
import type { TerminalShellInjected } from './shell.ts'
import { acquireCreate, MAX_TERMINALS_PER_GROUP, releaseCreate, snapshotOf, type createTerminalSessionStore } from './stores.ts'
import { TerminalPane } from './TerminalPane.tsx'
import css from './TerminalWorkspace.module.css'

export type TerminalWorkspaceProps =
  & Pick<PropsRuntime<'shell.terminalDrawer'>, 'useSessions'>
  & PropsStore<ReturnType<typeof createTerminalSessionStore>>
  & PropsLocale<typeof NS>
  & Omit<TerminalShellInjected, 'onPtyData' | 'onPtyExit'>
  & { mode: 'drawer' | 'surface'; sessionId: SessionId | undefined }

/**
 * Shared terminal chrome: toolbar, empty state, and tiled PTY panes.
 * @param props - session seats, shared store, PTY IPC, layout writes, and copy.
 * @returns the drawer or surface body.
 */
export function TerminalWorkspace({
  mode,
  sessionId,
  useSessions,
  useStore,
  actions,
  ptyCreate,
  ptyWrite,
  ptyResize,
  ptyKill,
  setTerminalDrawer,
  t,
}: TerminalWorkspaceProps): ReactNode {
  const cwd = useSessions(list => cwdFromSessions(sessionId, list))
  const sessions = useStore(s => s.sessions)
  const activeId = useStore(s => s.activeId)
  const groups = useStore(s => s.groups)
  const createFailed = useStore(s => s.createFailed)
  const rootRef = useRef<HTMLElement | null>(null)
  const drag = useRef<{ pointerId: number; startY: number; startHeight: number } | null>(null)

  const activeGroup = groups.find(group => group.terminalIds.includes(activeId)) ?? groups[0]
  const visibleIds = activeGroup?.terminalIds ?? (activeId ? [activeId] : [])
  const atLimit = visibleIds.length >= MAX_TERMINALS_PER_GROUP
  const available = Boolean(cwd)

  const create = useCallback(async (kind: 'new' | 'split') => {
    if (!cwd || !acquireCreate(actions)) return
    if (kind === 'split' && atLimit) {
      releaseCreate(actions)
      return
    }
    try {
      const created = await ptyCreate({ cwd })
      if (kind === 'split') actions.split(created.id, cwd)
      else actions.newTerminal(created.id, cwd)
    } catch {
      actions.failCreate()
    } finally {
      releaseCreate(actions)
    }
  }, [actions, atLimit, cwd, ptyCreate])

  const closeActive = useCallback(() => {
    if (!activeId) return
    const id = activeId
    actions.close(id)
    void ptyKill(id)
  }, [actions, activeId, ptyKill])

  const wasOpen = useRef(false)
  useEffect(() => {
    const el = rootRef.current
    if (el === null || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => {
      const open = el.clientHeight > 0
      const justOpened = open && !wasOpen.current
      wasOpen.current = open
      if (!justOpened) return
      const snap = snapshotOf(actions)
      if (!cwd || !snap || snap.sessions.length > 0 || snap.createFailed) return
      void create('new')
    })
    observer.observe(el)
    return () => { observer.disconnect() }
  }, [actions, create, createFailed, cwd])

  useEffect(() => {
    const el = rootRef.current
    if (el === null || !activeId || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => {
      const width = el.clientWidth
      const height = el.clientHeight
      if (width <= 0 || height <= 0) return
      const cols = Math.max(20, Math.floor(width / 8))
      const rows = Math.max(8, Math.floor(height / 16))
      actions.setSize(activeId, cols, rows)
      void ptyResize(activeId, cols, rows)
    })
    observer.observe(el)
    return () => { observer.disconnect() }
  }, [actions, activeId, ptyResize])

  const onResizePointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    event.preventDefault()
    const height = rootRef.current?.clientHeight ?? 0
    drag.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startHeight: height > 0 ? height : TERMINAL_DRAWER_DEFAULT,
    }
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }, [])

  const onResizePointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const state = drag.current
    if (!state || state.pointerId !== event.pointerId) return
    event.preventDefault()
    setTerminalDrawer(clampDrawerHeight(
      state.startHeight + (state.startY - event.clientY),
      window.innerHeight,
    ))
  }, [setTerminalDrawer])

  const onResizePointerEnd = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag.current || drag.current.pointerId !== event.pointerId) return
    drag.current = null
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture?.(event.pointerId)
    }
  }, [])

  const splitLabel = atLimit ? t('action.split.limit') : t('action.split')

  return (
    <aside ref={rootRef} className={css.root} data-terminal-owner={mode}>
      {mode === 'drawer' ? (
        <div
          className={css.resize}
          role="separator"
          aria-orientation="horizontal"
          aria-label={t('resize')}
          onPointerDown={onResizePointerDown}
          onPointerMove={onResizePointerMove}
          onPointerUp={onResizePointerEnd}
          onPointerCancel={onResizePointerEnd}
        />
      ) : null}

      <div className={css.toolbar}>
        <Tooltip label={splitLabel} side="bottom">
          <button
            type="button"
            className={css.action}
            aria-label={splitLabel}
            disabled={!available || sessions.length === 0 || atLimit}
            onClick={() => { void create('split') }}
          >
            <IconSplitOutline16 size={14} />
          </button>
        </Tooltip>
        <div className={css.rule} />
        {mode === 'drawer' ? (
          <>
            <Tooltip label={t('action.maximize')} side="bottom">
              <button
                type="button"
                className={css.action}
                aria-label={t('action.maximize')}
                onClick={() => { setTerminalDrawer(maxDrawerHeight(window.innerHeight)) }}
              >
                <IconFullscreenOutline16 size={14} />
              </button>
            </Tooltip>
            <div className={css.rule} />
          </>
        ) : null}
        <Tooltip label={t('action.new')} side="bottom">
          <button
            type="button"
            className={css.action}
            aria-label={t('action.new')}
            disabled={!available}
            onClick={() => { void create('new') }}
          >
            <IconPlusOutline16 size={14} />
          </button>
        </Tooltip>
        <div className={css.rule} />
        <Tooltip label={t('action.close')} side="bottom">
          <button
            type="button"
            className={css.action}
            aria-label={t('action.close')}
            disabled={!activeId}
            onClick={closeActive}
          >
            <IconTrashOutline16 size={14} />
          </button>
        </Tooltip>
      </div>

      <div className={css.body}>
        {sessions.length === 0 ? (
          <div className={css.empty}>
            <p>{!available ? t('empty.unavailable') : createFailed ? t('error.create') : t('empty.title')}</p>
          </div>
        ) : (
          <div className={css.panes}>
            {visibleIds.map(id => {
              const session = sessions.find(item => item.id === id)
              return (
                <div
                  key={id}
                  role="group"
                  tabIndex={0}
                  className={clsx(css.pane)}
                  data-active={id === activeId || undefined}
                  aria-label={`${t('session.label')} ${id}`}
                  onClick={() => { actions.activate(id) }}
                >
                  <TerminalPane
                    id={id}
                    session={session}
                    onData={bytes => { void ptyWrite(id, bytes) }}
                    onResize={(cols, rows) => {
                      actions.setSize(id, cols, rows)
                      void ptyResize(id, cols, rows)
                    }}
                  />
                </div>
              )
            })}
          </div>
        )}
      </div>
    </aside>
  )
}
