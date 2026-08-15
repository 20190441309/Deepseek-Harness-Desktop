import { callRpc } from './rpc.ts'
import { sessionTitle } from './fold.ts'

export { relativeTime } from './fold.ts'

export type SessionRow = {
  sessionId: string
  title: string
  updatedAt: number
  running: boolean
  blank: boolean
  cwd?: string
}

export type WorkspaceRow = {
  workspaceId: string
  title: string
  path: string
  sessionIds: string[]
}

export type HomeData = {
  workspaces: WorkspaceRow[]
  sessions: SessionRow[]
  archived: Set<string>
}

type SessionListItem = {
  sessionId: string
  updatedAt: number
  running: boolean
  blank: boolean
  cwd?: string
  projections?: { values?: Record<string, unknown> }
}

type WorkspaceListItem = {
  workspaceId: string
  title: string
  path: string
  sessionIds: string[]
}

export async function describeHost(): Promise<void> {
  await callRpc('host.describe', {})
}

export async function loadHome(): Promise<HomeData> {
  const [sessions, workspaces] = await Promise.all([
    callRpc<{ items: SessionListItem[] }>('session.list', {}),
    callRpc<{ items: WorkspaceListItem[]; archivedSessionIds: string[] }>('workspace.list', {}),
  ])
  return {
    workspaces: (workspaces.items || []).map((item) => ({
      workspaceId: item.workspaceId,
      title: item.title || item.path,
      path: item.path,
      sessionIds: item.sessionIds || [],
    })),
    sessions: (sessions.items || []).map((item) => ({
      sessionId: item.sessionId,
      title: sessionTitle(item),
      updatedAt: item.updatedAt,
      running: item.running,
      blank: item.blank,
      cwd: item.cwd,
    })),
    archived: new Set(workspaces.archivedSessionIds || []),
  }
}

export async function loadHistory(sessionId: string): Promise<unknown[]> {
  const page = await callRpc<{ events: unknown[] }>('session.history', {
    sessionId,
    maxMessages: 200,
  })
  return page.events || []
}

export async function sendPrompt(sessionId: string, text: string): Promise<void> {
  await callRpc('session.prompt', {
    sessionId,
    mode: 'queue',
    content: [{ type: 'text', text }],
  })
}

export async function createSession(workspaceId?: string): Promise<{ sessionId: string }> {
  return callRpc('session.create', workspaceId ? { workspaceId } : {})
}

export async function renameSession(sessionId: string, title: string): Promise<{ title: string }> {
  return callRpc('session.rename', { sessionId, title })
}

export async function forkSession(sessionId: string): Promise<{ sessionId: string; blank: boolean }> {
  return callRpc('session.fork', { sessionId })
}

export async function archiveSession(sessionId: string): Promise<{ archivedSessionIds: string[] }> {
  return callRpc('workspace.archiveSession', { sessionId })
}

export type SearchHit = {
  sessionId: string
  snippet: string
}

export async function searchSessions(query: string): Promise<{ items: SearchHit[]; hasMore: boolean }> {
  return callRpc('session.search', { query })
}

type FrameHandler = (frame: Record<string, unknown>) => void

function openDownlink(path: string, onFrame: FrameHandler): () => void {
  const url = new URL(path, location.href)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  const socket = new WebSocket(url)
  socket.addEventListener('message', (event) => {
    if (typeof event.data !== 'string') {
      return
    }
    try {
      const full = JSON.parse(event.data) as { payload?: unknown }
      if (full.payload && typeof full.payload === 'object') {
        onFrame(full.payload as Record<string, unknown>)
      }
    } catch {
      // A bad frame must not tear down the sockets; the next one may still stream.
    }
  })
  return () => {
    if (socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.OPEN) {
      socket.close()
    }
  }
}

/** Mux + host downlinks. Phone remote must use WebSocket, not SSE. */
export function listenDownlinks(onFrame: FrameHandler): () => void {
  const stopMux = openDownlink('/api/events.mux', onFrame)
  const stopHost = openDownlink('/api/events.host', onFrame)
  return () => {
    stopMux()
    stopHost()
  }
}
