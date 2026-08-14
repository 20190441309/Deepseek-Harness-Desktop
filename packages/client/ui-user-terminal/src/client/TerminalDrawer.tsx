import { useEffect, type ReactNode } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import { cwdFromSessions } from './cwd.ts'
import { NS } from './locales.ts'
import type { TerminalShellInjected } from './shell.ts'
import type { createTerminalSessionStore } from './stores.ts'
import { TerminalWorkspace } from './TerminalWorkspace.tsx'

export type { TerminalShellInjected }

export type TerminalDrawerProps =
  & PropsRuntime<'shell.terminalDrawer'>
  & Partial<PropsStore<ReturnType<typeof createTerminalSessionStore>>>
  & PropsLocale<typeof NS>
  & InjectFace<TerminalShellInjected>

/**
 * Bottom-drawer occupant of `shell.terminalDrawer`.
 * @param props - session-maybe seats, shared store, PTY IPC, and layout writes.
 * @returns the drawer chrome, or an empty unavailable state before a session exists.
 */
export function TerminalDrawer(props: TerminalDrawerProps): ReactNode {
  const cwd = props.useSessions(list => cwdFromSessions(props.sessionId, list))

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!event.ctrlKey && !event.metaKey) return
      if (event.key !== '`') return
      event.preventDefault()
      if (!cwd) return
      props.toggleTerminalDrawer()
    }
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('keydown', onKey) }
  }, [cwd, props.toggleTerminalDrawer])

  if (props.useStore === undefined || props.actions === undefined) {
    return (
      <aside data-terminal-owner="drawer">
        <p>{props.t('empty.unavailable')}</p>
        <button type="button" aria-label={props.t('action.new')} disabled>
          {props.t('action.new')}
        </button>
      </aside>
    )
  }

  return (
    <TerminalWorkspace
      mode="drawer"
      sessionId={props.sessionId}
      useSessions={props.useSessions}
      useStore={props.useStore}
      actions={props.actions}
      ptyCreate={props.ptyCreate}
      ptyWrite={props.ptyWrite}
      ptyResize={props.ptyResize}
      ptyKill={props.ptyKill}
      onPtyData={props.onPtyData}
      onPtyExit={props.onPtyExit}
      toggleTerminalDrawer={props.toggleTerminalDrawer}
      setTerminalDrawer={props.setTerminalDrawer}
      t={props.t}
    />
  )
}
