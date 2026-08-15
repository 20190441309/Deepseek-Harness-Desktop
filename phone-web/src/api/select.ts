import type { HomeData, SessionRow, WorkspaceRow } from './client.ts'

export function isLiveSession(session: SessionRow, archived: Set<string>): boolean {
  return !session.blank && !archived.has(session.sessionId)
}

/** Restore-latest: remembered live row, else most recently updated live row. */
export function pickInitialSession(home: HomeData, rememberedId: string): SessionRow | null {
  const remembered = home.sessions.find((session) => session.sessionId === rememberedId)
  if (remembered && isLiveSession(remembered, home.archived)) {
    return remembered
  }
  let latest: SessionRow | null = null
  for (const session of home.sessions) {
    if (!isLiveSession(session, home.archived)) {
      continue
    }
    if (!latest || session.updatedAt > latest.updatedAt) {
      latest = session
    }
  }
  return latest
}

export function workspaceOfSession(home: HomeData, sessionId: string): WorkspaceRow | undefined {
  return home.workspaces.find((workspace) => workspace.sessionIds.includes(sessionId))
}

export function resolveStartWorkspace(
  home: HomeData,
  currentSessionId?: string,
  explicitId?: string,
): WorkspaceRow | undefined {
  if (explicitId) {
    return home.workspaces.find((workspace) => workspace.workspaceId === explicitId)
  }
  if (currentSessionId) {
    const owned = workspaceOfSession(home, currentSessionId)
    if (owned) {
      return owned
    }
  }
  const latest = pickInitialSession(home, '')
  if (latest) {
    const owned = workspaceOfSession(home, latest.sessionId)
    if (owned) {
      return owned
    }
  }
  return home.workspaces[0]
}

export function findReusableBlank(home: HomeData, workspace: WorkspaceRow): SessionRow | undefined {
  return home.sessions.find((session) => (
    session.blank
    && session.cwd === workspace.path
    && workspace.sessionIds.includes(session.sessionId)
    && !home.archived.has(session.sessionId)
  ))
}

export type DrawerGroup = {
  workspace: WorkspaceRow
  sessions: SessionRow[]
}

export function drawerGroups(home: HomeData): { grouped: DrawerGroup[]; leftover: SessionRow[] } {
  const byId = new Map(home.sessions.map((session) => [session.sessionId, session]))
  const visible = (ids: string[]): SessionRow[] => {
    const rows: SessionRow[] = []
    for (const id of ids) {
      const session = byId.get(id)
      if (session && isLiveSession(session, home.archived)) {
        rows.push(session)
      }
    }
    return rows
  }
  const grouped = home.workspaces.map((workspace) => ({
    workspace,
    sessions: visible(workspace.sessionIds),
  }))
  const listed = new Set(grouped.flatMap((group) => group.sessions.map((session) => session.sessionId)))
  const leftover = home.sessions.filter((session) => (
    isLiveSession(session, home.archived) && !listed.has(session.sessionId)
  ))
  return { grouped, leftover }
}

function matchesNeedle(text: string, needle: string): boolean {
  return text.toLowerCase().includes(needle)
}

export function filterDrawer(
  grouped: DrawerGroup[],
  leftover: SessionRow[],
  query: string,
  contentIds: Set<string>,
): { grouped: DrawerGroup[]; leftover: SessionRow[] } {
  const needle = query.trim().toLowerCase()
  if (!needle && contentIds.size === 0) {
    return { grouped, leftover }
  }
  const keep = (session: SessionRow, workspaceTitle = ''): boolean => {
    if (contentIds.has(session.sessionId)) {
      return true
    }
    if (!needle) {
      return false
    }
    return matchesNeedle(session.title, needle) || matchesNeedle(workspaceTitle, needle)
  }
  return {
    grouped: grouped
      .map((group) => {
        const workspaceHit = Boolean(needle && matchesNeedle(group.workspace.title, needle))
        return {
          workspace: group.workspace,
          sessions: workspaceHit ? group.sessions : group.sessions.filter((session) => keep(session, group.workspace.title)),
        }
      })
      .filter((group) => group.sessions.length > 0 || Boolean(needle && matchesNeedle(group.workspace.title, needle))),
    leftover: leftover.filter((session) => keep(session)),
  }
}

export function connectionMode(hostname: string): 'lan' | 'relay' {
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]') {
    return 'lan'
  }
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) {
    return 'lan'
  }
  return 'relay'
}
