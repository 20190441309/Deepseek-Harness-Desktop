/**
 * Shared PTY session table for the bottom drawer and the right-panel
 * Terminal surface. One handle is seated on both registrations so
 * activate(id) reads the same record from either shell.
 */
import { defineStore, type EngineStoreHandle } from '@deepseek-ai/dsh-client-runtime/client'

/** T3code per-group split ceiling. */
export const MAX_TERMINALS_PER_GROUP = 4
/** Default PTY columns before the viewport reports a fit. */
export const DEFAULT_TERMINAL_COLS = 80
/** Default PTY rows before the viewport reports a fit. */
export const DEFAULT_TERMINAL_ROWS = 24

/** One live PTY session the drawer and surface can both attach. */
export type TerminalSessionRecord = {
  id: string
  cwd: string
  cols: number
  rows: number
  buffer: string
}

/** Split group: terminals tiled together, capped at MAX_TERMINALS_PER_GROUP. */
export type TerminalGroup = {
  id: string
  terminalIds: string[]
}

/** Shared terminal UI state. */
export type TerminalSessionState = {
  sessions: TerminalSessionRecord[]
  activeId: string
  groups: TerminalGroup[]
}

type TerminalSessionActions = {
  activate: (draft: TerminalSessionState, id: string) => void
  newTerminal: (draft: TerminalSessionState, id: string, cwd: string) => void
  split: (draft: TerminalSessionState, id: string, cwd: string) => void
  close: (draft: TerminalSessionState, id: string) => void
  setSize: (draft: TerminalSessionState, id: string, cols: number, rows: number) => void
  appendData: (draft: TerminalSessionState, id: string, data: string) => void
}

function emptyState(): TerminalSessionState {
  return { sessions: [], activeId: '', groups: [] }
}

function recordOf(id: string, cwd: string): TerminalSessionRecord {
  return { id, cwd, cols: DEFAULT_TERMINAL_COLS, rows: DEFAULT_TERMINAL_ROWS, buffer: '' }
}

function groupIdFor(terminalId: string): string {
  return `group-${terminalId}`
}

function findGroupIndex(state: TerminalSessionState, terminalId: string): number {
  return state.groups.findIndex(group => group.terminalIds.includes(terminalId))
}

function activeGroupIndex(state: TerminalSessionState): number {
  const byActive = findGroupIndex(state, state.activeId)
  if (byActive >= 0) return byActive
  return state.groups.length === 0 ? -1 : 0
}

function hasSession(state: TerminalSessionState, id: string): boolean {
  return state.sessions.some(session => session.id === id)
}

/**
 * Create the shared terminal-session store handle. Production seats one
 * handle on both drawer and surface registrations; tests call create().
 * @returns the store handle.
 */
export function createTerminalSessionStore(): EngineStoreHandle<TerminalSessionState, TerminalSessionActions> {
  return defineStore({
    init: emptyState,
    actions: {
      activate: (draft, id: string) => {
        if (!hasSession(draft, id)) return
        draft.activeId = id
      },
      newTerminal: (draft, id: string, cwd: string) => {
        if (id.trim() === '' || hasSession(draft, id)) {
          if (hasSession(draft, id)) draft.activeId = id
          return
        }
        draft.sessions.push(recordOf(id, cwd))
        draft.groups.push({ id: groupIdFor(id), terminalIds: [id] })
        draft.activeId = id
      },
      split: (draft, id: string, cwd: string) => {
        if (id.trim() === '' || hasSession(draft, id)) return
        if (draft.sessions.length === 0) {
          draft.sessions.push(recordOf(id, cwd))
          draft.groups.push({ id: groupIdFor(id), terminalIds: [id] })
          draft.activeId = id
          return
        }
        const groupIndex = activeGroupIndex(draft)
        const group = groupIndex >= 0 ? draft.groups[groupIndex] : undefined
        if (group === undefined || group.terminalIds.length >= MAX_TERMINALS_PER_GROUP) return
        draft.sessions.push(recordOf(id, cwd))
        group.terminalIds.push(id)
        draft.activeId = id
      },
      close: (draft, id: string) => {
        const index = draft.sessions.findIndex(session => session.id === id)
        if (index < 0) return
        draft.sessions.splice(index, 1)
        for (let groupIndex = draft.groups.length - 1; groupIndex >= 0; groupIndex -= 1) {
          const group = draft.groups[groupIndex]
          if (group === undefined) continue
          group.terminalIds = group.terminalIds.filter(terminalId => terminalId !== id)
          if (group.terminalIds.length === 0) draft.groups.splice(groupIndex, 1)
        }
        if (draft.sessions.length === 0) {
          draft.activeId = ''
          return
        }
        if (draft.activeId === id) {
          const neighbor = draft.sessions[Math.min(index, draft.sessions.length - 1)]
          draft.activeId = neighbor?.id ?? ''
        }
      },
      setSize: (draft, id: string, cols: number, rows: number) => {
        const session = draft.sessions.find(item => item.id === id)
        if (session === undefined) return
        session.cols = cols
        session.rows = rows
      },
      appendData: (draft, id: string, data: string) => {
        const session = draft.sessions.find(item => item.id === id)
        if (session === undefined) return
        session.buffer += data
      },
    },
  })
}
