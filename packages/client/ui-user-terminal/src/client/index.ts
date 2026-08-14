/** Browser plugin owning the shared user-terminal drawer and surface. */

export { apply, inject } from './apply.ts'
export type {
  TerminalDrawerProps, TerminalKey, TerminalShellInjected, TerminalSurfaceProps,
} from './apply.ts'
export { createTerminalSessionStore, MAX_TERMINALS_PER_GROUP } from './apply.ts'
