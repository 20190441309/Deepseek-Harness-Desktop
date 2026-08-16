import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { defaultMounter, McpServersFile } from '../src/service.ts'
import type { ChildHandle, McpClientMounter } from '../src/service.ts'
import type { Config as McpClientConfig } from '@deepseek-ai/dsh-mcp-client'

const contexts: Context[] = []

afterEach(async () => {
  await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose()))
})

async function home(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'dsh-mcp-servers-'))
}

function trackingMounter(mounted: McpClientConfig[]): McpClientMounter {
  return (_ctx, config): ChildHandle => {
    mounted.push(config)
    return {
      dispose: () => {
        const index = mounted.indexOf(config)
        if (index !== -1) mounted.splice(index, 1)
      },
      phase: () => 'active',
    }
  }
}

describe('McpServersFile', () => {
  it('loads an absent file as empty and writes an upsert', async () => {
    const dshHome = await home()
    const ctx = new Context()
    contexts.push(ctx)
    const mounted: McpClientConfig[] = []
    const service = new McpServersFile(ctx, { dshHome, watch: false })
    service.useMounter(trackingMounter(mounted))
    const stop = service.start()
    await service.upsert({
      id: 'github',
      enabled: true,
      transport: 'stdio',
      serverName: 'github',
      command: 'npx',
      env: { GITHUB_TOKEN: 'abc' },
    })
    const listed = service.listManaged()[0]
    expect(listed?.transport === 'stdio' && listed.env?.GITHUB_TOKEN).toBe('********')
    expect(mounted).toHaveLength(1)
    expect(mounted[0]).toMatchObject({ serverName: 'github', command: 'npx' })
    const text = await readFile(join(dshHome, 'mcp-servers.yaml'), 'utf8')
    expect(text).toContain('github')
    expect(text).toContain('abc')
    await service.setEnabled('github', false)
    expect(mounted).toHaveLength(0)
    await service.remove('github')
    expect(service.listManaged()).toEqual([])
    stop()
  })

  it('mounts enabled records from an existing file', async () => {
    const dshHome = await home()
    await writeFile(join(dshHome, 'mcp-servers.yaml'), `
servers:
  - id: http
    transport: streamable-http
    serverName: http
    url: http://127.0.0.1:9/mcp
`)
    const ctx = new Context()
    contexts.push(ctx)
    const mounted: McpClientConfig[] = []
    const service = new McpServersFile(ctx, { dshHome, watch: false })
    service.useMounter(trackingMounter(mounted))
    service.start()
    await service.upsert({
      id: 'http',
      enabled: true,
      transport: 'streamable-http',
      serverName: 'http',
      url: 'http://127.0.0.1:9/mcp',
    })
    expect(mounted[0]).toMatchObject({ transport: 'streamable-http', url: 'http://127.0.0.1:9/mcp' })
    expect(service.childPhase('http')).toBe('active')
  })

  it('remounts when an enabled record changes', async () => {
    const dshHome = await home()
    const ctx = new Context()
    contexts.push(ctx)
    const mounted: McpClientConfig[] = []
    const service = new McpServersFile(ctx, { dshHome, watch: false })
    service.useMounter(trackingMounter(mounted))
    service.start()
    await service.upsert({
      id: 'github',
      enabled: true,
      transport: 'stdio',
      serverName: 'github',
      command: 'npx',
    })
    await service.upsert({
      id: 'github',
      enabled: true,
      transport: 'stdio',
      serverName: 'github',
      command: 'uvx',
    })
    expect(mounted).toHaveLength(1)
    expect(mounted[0]).toMatchObject({ command: 'uvx' })
  })

  it('defaultMounter reports fiber phase from the child plugin', () => {
    const dispose = (): void => {}
    const ctx = {
      plugin: () => ({ dispose, state: 2 }),
    }
    const handle = defaultMounter(ctx as never, {
      transport: 'stdio',
      serverName: 'x',
      command: 'npx',
      args: [],
      env: {},
      cwd: '',
      toolCallTimeoutMs: 1,
      failOnStartupError: false,
    })
    expect(handle.phase()).toBe('active')
    void handle.dispose()
  })
})
