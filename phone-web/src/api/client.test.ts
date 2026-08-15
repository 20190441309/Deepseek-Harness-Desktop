import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('session RPCs', () => {
  it('posts create rename fork archive and search', async () => {
    const calls: string[] = []
    vi.stubGlobal('fetch', async (input: string, init?: RequestInit) => {
      expect(input).toContain('/api/')
      const body = JSON.parse(String(init?.body || '{}')) as { method?: string; rpcId?: string }
      calls.push(String(body.method))
      return {
        ok: true,
        status: 200,
        json: async () => ({
          rpcId: body.rpcId,
          result: {
            ok: true,
            value: body.method === 'session.search'
              ? { items: [], hasMore: false }
              : body.method === 'workspace.archiveSession'
                ? { archivedSessionIds: [] }
                : body.method === 'session.fork'
                  ? { sessionId: 'child', blank: false }
                  : body.method === 'session.rename'
                    ? { title: 'n', seq: 1 }
                    : { sessionId: 'new' },
          },
        }),
      }
    })
    const {
      createSession, renameSession, forkSession, archiveSession, searchSessions,
    } = await import('./client.ts')
    await createSession('ws-1')
    await renameSession('s1', 'n')
    await forkSession('s1')
    await archiveSession('s1')
    await searchSessions('hello')
    expect(calls).toEqual([
      'session.create',
      'session.rename',
      'session.fork',
      'workspace.archiveSession',
      'session.search',
    ])
  })
})
