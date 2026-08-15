import { describe, expect, it } from 'vitest'
import type { HomeData, SessionRow } from './client.ts'
import {
  connectionMode,
  drawerGroups,
  filterDrawer,
  findReusableBlank,
  pickInitialSession,
  resolveStartWorkspace,
} from './select.ts'

function home(partial: Partial<HomeData> & { sessions: SessionRow[] }): HomeData {
  return {
    workspaces: [],
    archived: new Set(),
    ...partial,
  }
}

describe('pickInitialSession', () => {
  const live: SessionRow = { sessionId: 'a', title: 'A', updatedAt: 10, running: false, blank: false }
  const newer: SessionRow = { sessionId: 'b', title: 'B', updatedAt: 20, running: false, blank: false }
  const blank: SessionRow = { sessionId: 'c', title: 'C', updatedAt: 30, running: false, blank: true }
  const archived: SessionRow = { sessionId: 'd', title: 'D', updatedAt: 40, running: false, blank: false }

  it('prefers a remembered live session', () => {
    expect(pickInitialSession(home({
      sessions: [live, newer],
    }), 'a')?.sessionId).toBe('a')
  })

  it('ignores remembered blank or archived rows and opens the latest live one', () => {
    expect(pickInitialSession(home({
      sessions: [live, newer, blank, archived],
      archived: new Set(['d']),
    }), 'c')?.sessionId).toBe('b')
    expect(pickInitialSession(home({
      sessions: [live, newer, blank, archived],
      archived: new Set(['d']),
    }), 'd')?.sessionId).toBe('b')
  })

  it('returns null when nothing live remains', () => {
    expect(pickInitialSession(home({
      sessions: [blank],
    }), '')).toBeNull()
  })
})

describe('start workspace helpers', () => {
  const workspace = { workspaceId: 'w1', title: 'proj', path: '/proj', sessionIds: ['blank'] }
  const blank: SessionRow = {
    sessionId: 'blank', title: 'New', updatedAt: 1, running: false, blank: true, cwd: '/proj',
  }

  it('reuses a blank member of the workspace', () => {
    expect(findReusableBlank(home({
      workspaces: [workspace],
      sessions: [blank],
    }), workspace)?.sessionId).toBe('blank')
  })

  it('does not reuse an archived blank', () => {
    expect(findReusableBlank(home({
      workspaces: [workspace],
      sessions: [blank],
      archived: new Set(['blank']),
    }), workspace)).toBeUndefined()
  })

  it('resolves an explicit workspace before the current session', () => {
    const other = { workspaceId: 'w2', title: 'other', path: '/other', sessionIds: [] }
    expect(resolveStartWorkspace(home({
      workspaces: [workspace, other],
      sessions: [{ sessionId: 's', title: 'S', updatedAt: 1, running: false, blank: false }],
    }), 's', 'w2')?.workspaceId).toBe('w2')
  })
})

describe('drawer grouping', () => {
  it('keeps empty workspaces so New chat still has a +', () => {
    const groups = drawerGroups(home({
      workspaces: [{ workspaceId: 'w1', title: 'proj', path: '/proj', sessionIds: [] }],
      sessions: [],
    }))
    expect(groups.grouped).toHaveLength(1)
    expect(groups.grouped[0].sessions).toEqual([])
  })

  it('filters by title and content hits', () => {
    const session: SessionRow = { sessionId: 's1', title: '猫娘', updatedAt: 1, running: false, blank: false }
    const grouped = [{
      workspace: { workspaceId: 'w1', title: 'proj', path: '/proj', sessionIds: ['s1'] },
      sessions: [session],
    }]
    expect(filterDrawer(grouped, [], '猫', new Set()).grouped[0].sessions).toHaveLength(1)
    expect(filterDrawer(grouped, [], 'zzz', new Set(['s1'])).grouped[0].sessions).toHaveLength(1)
    expect(filterDrawer(grouped, [], 'zzz', new Set()).grouped).toHaveLength(0)
  })
})

describe('connectionMode', () => {
  it('treats private hosts as LAN and public names as relay', () => {
    expect(connectionMode('192.168.1.8')).toBe('lan')
    expect(connectionMode('localhost')).toBe('lan')
    expect(connectionMode('relay.example')).toBe('relay')
  })
})
