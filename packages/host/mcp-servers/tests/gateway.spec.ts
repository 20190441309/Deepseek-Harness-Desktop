import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import { remoteMethods } from '@deepseek-ai/dsh-typert-protocol'
import type { McpServerRecord } from '@deepseek-ai/dsh-mcp-servers-file'
import McpServersGateway from '../src/index.ts'

const contexts: Context[] = []

afterEach(async () => {
  await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose()))
})

const mcpPlugin = { name: 'mcp-client', apply() {} }

type TestHealth = { health: 'connecting' | 'connected' | 'reconnecting' | 'failed'; lastError?: string }

async function harness(managed: McpServerRecord[] = [], health: {
  managed?: TestHealth
  composition?: TestHealth
} = {}) {
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(Loader)
  ctx.loader.builtins['mcp-client'] = mcpPlugin
  ctx.provide('mcpServersFile', {
    listManaged: () => managed,
    childPhase: () => 'active' as const,
    childHealth: () => health.managed,
    connectionStatus: () => health.composition,
    upsert: async (spec: McpServerRecord) => { managed.splice(0, managed.length, spec) },
    remove: async (id: string) => {
      const index = managed.findIndex(item => item.id === id)
      if (index !== -1) managed.splice(index, 1)
    },
    setEnabled: async (id: string, enabled: boolean) => {
      const index = managed.findIndex(item => item.id === id)
      if (index !== -1) managed[index] = { ...managed[index]!, enabled }
    },
  } as never)
  await ctx.plugin(McpServersGateway)
  return { ctx, gateway: ctx.get('mcpServers') as McpServersGateway, managed }
}

describe('McpServersGateway', () => {
  it('publishes list, upsert, delete, and setEnabled remotes', async () => {
    const { gateway } = await harness()
    expect(remoteMethods(gateway).map(item => item.method).sort()).toEqual([
      'delete', 'list', 'setEnabled', 'upsert',
    ])
  })

  it('lists managed rows and composition-owned mcp-client entries', async () => {
    const { ctx, gateway } = await harness([{
      id: 'github',
      enabled: true,
      transport: 'stdio',
      serverName: 'github',
      command: 'npx',
    }])
    await ctx.loader.create({
      name: 'cordis:mcp-client',
      config: { serverName: 'memory', transport: 'stdio', command: 'mcp-server-memory' },
    })
    const snapshot = gateway.list()
    expect(snapshot.servers.map(entry => entry.origin)).toEqual(['managed', 'composition'])
    expect(snapshot.servers[1]?.writable).toBe(false)
  })

  it('writes managed upsert and enablement', async () => {
    const { gateway, managed } = await harness()
    await gateway.upsert({
      spec: {
        id: 'github',
        enabled: true,
        transport: 'stdio',
        serverName: 'github',
        command: 'npx',
      },
    })
    expect(managed[0]?.id).toBe('github')
    await gateway.setEnabled({ id: 'github', enabled: false })
    expect(managed[0]?.enabled).toBe(false)
    await gateway.delete({ id: 'github' })
    expect(managed).toEqual([])
  })

  it('projects an http composition row and skips unnamed or grouped entries', async () => {
    const { ctx, gateway } = await harness()
    await ctx.loader.create({
      name: 'cordis:mcp-client',
      config: {
        serverName: 'remote',
        transport: 'streamable-http',
        url: 'http://127.0.0.1:9/mcp',
        headers: { Accept: 'application/json' },
      },
    })
    await ctx.loader.create({
      name: 'cordis:mcp-client',
      config: { command: 'npx' },
    })
    const snapshot = gateway.list()
    expect(snapshot.servers).toHaveLength(1)
    expect(snapshot.servers[0]).toMatchObject({
      origin: 'composition',
      writable: false,
      spec: { transport: 'streamable-http', url: 'http://127.0.0.1:9/mcp' },
    })
  })

  it('masks secret env and headers on composition rows', async () => {
    const { ctx, gateway } = await harness()
    await ctx.loader.create({
      name: 'cordis:mcp-client',
      config: {
        serverName: 'memory',
        transport: 'stdio',
        command: 'mcp-server-memory',
        env: { API_TOKEN: 'plain-token', PATH: '/bin' },
      },
    })
    await ctx.loader.create({
      name: 'cordis:mcp-client',
      config: {
        serverName: 'remote',
        transport: 'streamable-http',
        url: 'http://127.0.0.1:9/mcp',
        headers: { Authorization: 'Bearer token', Accept: 'application/json' },
      },
    })
    const snapshot = gateway.list()
    const stdio = snapshot.servers.find(entry => entry.spec.serverName === 'memory')?.spec
    expect(stdio?.transport === 'stdio' && stdio.env?.API_TOKEN).toBe('********')
    expect(stdio?.transport === 'stdio' && stdio.env?.PATH).toBe('/bin')
    const http = snapshot.servers.find(entry => entry.spec.serverName === 'remote')?.spec
    expect(http?.transport === 'streamable-http' && http.headers?.Authorization).toBe('********')
    expect(http?.transport === 'streamable-http' && http.headers?.Accept).toBe('application/json')
  })

  it('carries live connection health on managed and composition rows', async () => {
    const { ctx, gateway } = await harness([{
      id: 'github',
      enabled: true,
      transport: 'stdio',
      serverName: 'github',
      command: 'npx',
    }], {
      managed: { health: 'reconnecting', lastError: 'Error: spawn ENOENT' },
      composition: { health: 'failed', lastError: 'connection refused' },
    })
    await ctx.loader.create({
      name: 'cordis:mcp-client',
      config: { serverName: 'memory', transport: 'stdio', command: 'mcp-server-memory' },
    })
    const snapshot = gateway.list()
    expect(snapshot.servers.find(entry => entry.id === 'github')?.connection)
      .toMatchObject({ health: 'reconnecting', lastError: 'Error: spawn ENOENT' })
    expect(snapshot.servers.find(entry => entry.spec.serverName === 'memory')?.connection)
      .toMatchObject({ health: 'failed', lastError: 'connection refused' })
  })

  it('rejects mutations against a composition-owned id', async () => {
    const { ctx, gateway } = await harness()
    const entryId = await ctx.loader.create({
      name: 'cordis:mcp-client',
      config: { serverName: 'memory', command: 'mcp-server-memory' },
    })
    await expect(gateway.delete({ id: entryId })).rejects.toThrow(/read-only/)
  })
})
