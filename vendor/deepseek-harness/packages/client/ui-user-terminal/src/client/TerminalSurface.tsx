import type { ReactNode } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import { NS } from './locales.ts'
import type { TerminalShellInjected } from './shell.ts'
import type { createTerminalSessionStore } from './stores.ts'
import { TerminalWorkspace } from './TerminalWorkspace.tsx'

export type TerminalSurfaceProps =
  & PropsRuntime<'surfaces.terminal'>
  & Partial<PropsStore<ReturnType<typeof createTerminalSessionStore>>>
  & PropsLocale<typeof NS>
  & InjectFace<TerminalShellInjected>

/**
 * Right-panel Terminal occupant of `surfaces.terminal` (declared by Task 6).
 * @param props - session-maybe seats, the shared store, and PTY IPC.
 * @returns the surface chrome, or nothing before a session exists.
 */
export function TerminalSurface(props: TerminalSurfaceProps): ReactNode {
  if (props.useStore === undefined || props.actions === undefined) return null
  return (
    <TerminalWorkspace
      mode="surface"
      sessionId={props.sessionId}
      useSessions={props.useSessions}
      useStore={props.useStore}
      actions={props.actions}
      ptyCreate={props.ptyCreate}
      ptyWrite={props.ptyWrite}
      ptyResize={props.ptyResize}
      ptyKill={props.ptyKill}
      toggleTerminalDrawer={props.toggleTerminalDrawer}
      setTerminalDrawer={props.setTerminalDrawer}
      t={props.t}
    />
  )
}
