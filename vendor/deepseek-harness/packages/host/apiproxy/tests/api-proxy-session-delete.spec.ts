import { mkdirSync, mkdtempSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry, { Inbox } from '@deepseek-ai/dsh-agent'
import type { Agent, AgentFactory } from '@deepseek-ai/dsh-agent'
import SessionStore, { SessionId, SESSION_FORMAT_VERSION } from '@deepseek-ai/dsh-session'
import type { Session, SessionHeader } from '@deepseek-ai/dsh-session'
import Storage from '@deepseek-ai/dsh-storage'
import { DomainFacility } from '@deepseek-ai/dsh-storage-domain'
import UserQuestionService from '@deepseek-ai/dsh-user-questions'
import WorkspaceRegistry from '@deepseek-ai/dsh-workspace'
import type { HostFrame } from '@deepseek-ai/dsh-host-apiproxy/api'
import type { RpcRequest, RpcResponse } from '@deepseek-ai/dsh-host-apiproxy/api/rpc'
import { RpcId } from '@deepseek-ai/dsh-host-apiproxy/api/rpc'
import { createApiProxy } from '@deepseek-ai/dsh-host-apiproxy'
import { MemoryStorageBackend } from '../../../storage/storage-domain/tests/helpers/memory-backend.ts'

let nextRpc = 1

function request<P>(payload: P): RpcRequest<P> {
  return { rpcId: RpcId(`session-delete-${String(nextRpc++)}`), payload }
}

function expectOk<T>(response: RpcResponse<T>): T {
  expect(response.result.ok).toBe(true)
  if (!response.result.ok) throw new Error('unreachable')
  return response.result.value
}

async function nextHostFrame(
  stream: AsyncIterator<RpcRequest<HostFrame>>,
): Promise<RpcRequest<HostFrame>> {
  const next = await stream.next()
  if (next.done === true) throw new Error('Host stream ended before the expected increment')
  return next.value
}

function stubAgent(session: Session): Agent {
  return {
    id: session.id,
    options: {},
    session,
    inbox: new Inbox(session, { inserted: () => {}, discarded: () => {}, claimed: () => {} }),
    status: 'idle',
    ctx: new Context(),
    send: () => {},
    followup: () => {},
    steer: () => ({ outcome: Promise.resolve({ status: 'rejected' as const }) }),
    inject: () => {},
    cancel() {},
    runMaintenance: job => job(new AbortController().signal),
    whenIdle: () => Promise.resolve(),
  }
}

/** In-memory persistence covering the Host delete list/load/locate/delete path. */
class MemorySessionPersistence {
  private readonly headers = new Map<string, SessionHeader>()

  list(): Promise<SessionHeader[]> {
    return Promise.resolve([...this.headers.values()])
  }

  create(header: SessionHeader): Promise<void> {
    this.headers.set(header.id, header)
    return Promise.resolve()
  }

  load(id: SessionId): Promise<{ meta: SessionHeader; events: never[] }> {
    const stored = this.headers.get(id)
    if (stored === undefined) return Promise.reject(new Error(`session "${id}" not found`))
    return Promise.resolve({ meta: stored, events: [] })
  }

  inspect(id: SessionId): Promise<{ meta: SessionHeader; events: never[] }> {
    return this.load(id)
  }

  locate(header: SessionHeader): { kind: 'memory'; path: string } | undefined {
    return this.headers.has(header.id) ? { kind: 'memory', path: `/memory/${header.id}` } : undefined
  }

  delete(id: SessionId): Promise<void> {
    if (!this.headers.has(id)) return Promise.reject(new Error(`session "${id}" not found`))
    this.headers.delete(id)
    return Promise.resolve()
  }
}

function persistHeader(
  over: Partial<SessionHeader> & Pick<SessionHeader, 'id'> & { cwd: string },
): SessionHeader {
  return { version: SESSION_FORMAT_VERSION, createdAt: 1, ...over }
}

async function harness() {
  const root = realpathSync.native(mkdtempSync(join(tmpdir(), 'dsh-apiproxy-session-delete-')))
  const ctx = new Context()
  await ctx.plugin(SessionStore)
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(UserQuestionService)
  await ctx.plugin(Storage)
  ctx.storage.backend.register('memory', new MemoryStorageBackend())
  const storageDomain = new DomainFacility(ctx, { backend: 'memory', routes: {} })
  ctx.storage.mount('domain', storageDomain)
  ctx.provide('storageDomain', storageDomain)
  const persist = new MemorySessionPersistence()
  ctx.provide('sessionPersistence', persist as never)
  await ctx.plugin(WorkspaceRegistry)

  const factory: AgentFactory = {
    async createAgent(_ownerCtx, options) {
      const session = ctx.sessions.create(
        options.sessionId,
        options.meta === undefined ? {} : { meta: options.meta },
      )
      const agent = stubAgent(session)
      const unregister = ctx.agents.register(agent)
      return {
        agent,
        dispose: () => {
          unregister()
          return Promise.resolve()
        },
      }
    },
    async resume() {
      throw new Error('test harness has no persisted sessions')
    },
  }
  ctx.agents.setFactory(factory)
  ctx.provide('directoryPicker', {
    capability: () => ({ kind: 'native', pick: async () => null }),
  } as never)
  const api = createApiProxy(ctx, {
    defaultModelSelection: () => ({ provider: 'test', model: 'test-model' }),
    cwd: root,
  })
  return { api, ctx, persist, root }
}

function stageDir(root: string, name: string): string {
  const path = join(root, name)
  mkdirSync(path)
  return path
}

describe('session.delete', () => {
  it('refuses a known session that is not archived', async () => {
    const { api, ctx, persist, root } = await harness()
    const workspace = expectOk(await api.workspace.create(request({ path: stageDir(root, 'live') }))).workspace
    const sessionId = SessionId('session-live-not-archived')
    expectOk(await api.sessions.create(request({ workspaceId: workspace.workspaceId, sessionId })))
    await persist.create(ctx.sessions.get(sessionId)!.header)

    const response = await api.sessions.delete(request({ sessionId }))
    expect(response.result).toMatchObject({
      ok: false,
      error: { code: 'session-not-archived', details: { sessionId } },
    })
  })

  it('reports session-not-found for a ghost id', async () => {
    const { api } = await harness()
    const sessionId = SessionId('session-ghost')
    const response = await api.sessions.delete(request({ sessionId }))
    expect(response.result).toMatchObject({
      ok: false,
      error: { code: 'session-not-found', details: { sessionId } },
    })
  })

  it('refuses when any agent in the deletable set is running and deletes nothing', async () => {
    const { api, ctx, persist, root } = await harness()
    const workspace = expectOk(await api.workspace.create(request({ path: stageDir(root, 'running') }))).workspace
    const sessionId = SessionId('session-running-root')
    expectOk(await api.sessions.create(request({ workspaceId: workspace.workspaceId, sessionId })))
    await persist.create(ctx.sessions.get(sessionId)!.header)
    expectOk(await api.workspace.archiveSession(request({ sessionId })))
    const agent = ctx.agents.get(sessionId)
    expect(agent).toBeDefined()
    ;(agent as { status: Agent['status'] }).status = 'running'

    const response = await api.sessions.delete(request({ sessionId }))
    expect(response.result).toMatchObject({
      ok: false,
      error: { code: 'session-running', details: { sessionId } },
    })
    expect(ctx.agents.get(sessionId)).toBeDefined()
    expect((await persist.list()).map(item => item.id)).toContain(sessionId)
    expect(expectOk(await api.workspace.list(request({}))).archivedSessionIds).toContain(sessionId)
  })

  it('deletes nested persist-only subagents even when the child is not archived, and leaves a fork child listed', async () => {
    const { api, ctx, persist, root } = await harness()
    const workspace = expectOk(await api.workspace.create(request({ path: stageDir(root, 'tree') }))).workspace
    const rootId = SessionId('session-delete-root')
    const childId = SessionId('session-delete-child')
    const grandId = SessionId('session-delete-grand')
    const forkId = SessionId('session-delete-fork')
    const botId = SessionId('session-delete-dshbot')
    expectOk(await api.sessions.create(request({ workspaceId: workspace.workspaceId, sessionId: rootId })))
    const rootHeader = ctx.sessions.get(rootId)!.header
    await persist.create(rootHeader)
    await persist.create(persistHeader({
      id: childId, cwd: root, origin: 'subagent', parentSession: rootId,
    }))
    await persist.create(persistHeader({
      id: grandId, cwd: root, origin: 'subagent', parentSession: childId,
    }))
    await persist.create(persistHeader({ id: forkId, cwd: root, parentSession: rootId }))
    await persist.create(persistHeader({ id: botId, cwd: root, origin: 'dshbot', parentSession: rootId }))
    expectOk(await api.workspace.archiveSession(request({ sessionId: rootId })))

    const abort = new AbortController()
    const stream = api.events.host(request({}), abort.signal)[Symbol.asyncIterator]()

    const result = expectOk(await api.sessions.delete(request({ sessionId: rootId })))
    expect(result.deletedSessionIds).toEqual(expect.arrayContaining([rootId, childId, grandId]))
    expect(result.deletedSessionIds).not.toContain(forkId)
    expect(result.deletedSessionIds).not.toContain(botId)
    expect(result.archivedSessionIds).not.toContain(rootId)

    const seen: HostFrame['type'][] = []
    for (let i = 0; i < 8; i++) {
      seen.push((await nextHostFrame(stream)).payload.type)
      const deleted = seen.filter(type => type === 'host/session-deleted').length
      if (deleted >= 3 && seen.includes('host/archived-sessions-changed')) break
    }
    expect(seen.filter(type => type === 'host/session-deleted')).toHaveLength(3)
    expect(seen).toContain('host/archived-sessions-changed')
    expect(seen).not.toContain('host/session-removed')
    abort.abort()

    expect((await persist.list()).map(item => item.id).sort()).toEqual([botId, forkId].sort())
    await expect(persist.load(rootId)).rejects.toThrow(/not found/)
    await expect(persist.load(childId)).rejects.toThrow(/not found/)
    expect(persist.locate(rootHeader)).toBeUndefined()
    expect(ctx.agents.get(rootId)).toBeUndefined()
    const listed = expectOk(await api.workspace.list(request({})))
    expect(listed.archivedSessionIds).not.toContain(rootId)
    expect(listed.items[0]?.sessionIds).not.toContain(rootId)
  })

  it('fails the whole call when a live agent in the set has no retained handle', async () => {
    const { api, ctx, persist, root } = await harness()
    const sessionId = SessionId('session-live-unowned')
    const session = ctx.sessions.create(sessionId, { meta: { cwd: root } })
    ctx.agents.register(stubAgent(session))
    await persist.create(session.header)
    expectOk(await api.workspace.archiveSession(request({ sessionId })))

    const response = await api.sessions.delete(request({ sessionId }))
    expect(response.result).toMatchObject({
      ok: false,
      error: { code: 'session-live-unowned', details: { sessionId } },
    })
    expect(ctx.agents.get(sessionId)).toBeDefined()
    expect((await persist.list()).map(item => item.id)).toContain(sessionId)
  })
})
