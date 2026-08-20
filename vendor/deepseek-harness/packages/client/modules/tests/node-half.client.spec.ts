/** Node-half composition diagnostics for package metadata and built client bundles. */

import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it } from 'vitest'
import type { WebServer, WebRoute } from '@deepseek-ai/dsh-host-webserver'
import { ClientModuleRegistry } from '../src/index.ts'

let root: string | undefined

afterEach(() => {
  if (root !== undefined) rmSync(root, { recursive: true, force: true })
  root = undefined
})

/** Create a resolvable package whose client export points at the returned path. */
function writePackage(
  packageName: string,
  metadata: Record<string, unknown> = { dsh: { client: { platform: 'web' } } },
): string {
  root ??= realpathSync(mkdtempSync(join(tmpdir(), 'dsh-client-modules-')))
  const pkgRoot = join(root, 'node_modules', ...packageName.split('/'))
  const clientPath = join(pkgRoot, 'lib', 'client.js')
  mkdirSync(pkgRoot, { recursive: true })
  writeFileSync(join(pkgRoot, 'package.json'), JSON.stringify({
    name: packageName,
    exports: {
      './client': './lib/client.js',
      './package.json': './package.json',
    },
    ...metadata,
  }))
  return clientPath
}

/** Construct the node-half service and capture its plugin-bundle route. */
function constructWithRoute(packageNames: string[]): { service: ClientModuleRegistry; route: WebRoute } {
  const ctx = new Context()
  ctx.baseUrl = pathToFileURL(root!).href + '/'
  ctx.provide('loader', {
    *entries() {
      for (const packageName of packageNames) {
        yield { options: { name: packageName }, fiber: {}, disabled: false }
      }
    },
  })
  let route: WebRoute | undefined
  const webServer: Pick<WebServer, 'port' | 'register' | 'tapIndex'> = {
    port: 0,
    register: (candidate) => {
      if (candidate.path === '/plugins') route = candidate
      return () => {}
    },
    tapIndex: () => () => {},
  }
  ctx.provide('webServer', webServer as WebServer)
  const service = new ClientModuleRegistry(ctx)
  if (route === undefined) throw new Error('client bundle route was not registered')
  return { service, route }
}

/** Construct the node-half service over the enabled fixture entries. */
function construct(packageNames: string[]): ClientModuleRegistry {
  return constructWithRoute(packageNames).service
}

describe('client bundle activation', () => {
  it('allows sibling dsh roles', () => {
    const currentName = '@fixture/current-client-field'
    const clientPath = writePackage(currentName, {
      dsh: {
        bundle: { patch: './cordis.patch.yml' },
        client: { platform: 'web' },
        profile: { bundles: [] },
      },
    })
    mkdirSync(dirname(clientPath), { recursive: true })
    writeFileSync(clientPath, 'module.exports = {}\n')
    expect(construct([currentName]).graph().entries.map(entry => entry.id)).toEqual([currentName])
  })

  it('groups missing bundles under one source-build instruction with a package/path list', () => {
    const firstName = '@fixture/missing-first'
    const secondName = '@fixture/missing-second'
    const firstPath = writePackage(firstName)
    const secondPath = writePackage(secondName)
    expect(() => construct([firstName, secondName])).toThrow([
      'client-modules: 2 client packages failed to compose:',
      '  client bundles not found; run `pnpm run build` before launch:',
      `    - package: ${firstName}`,
      `      path: ${firstPath}`,
      `    - package: ${secondName}`,
      `      path: ${secondPath}`,
    ].join('\n'))
  })

  it('does not report other bundle read failures as missing builds', () => {
    const packageName = '@fixture/unreadable-client'
    const clientPath = writePackage(packageName)
    mkdirSync(clientPath, { recursive: true })
    let thrown: unknown
    try {
      construct([packageName])
    } catch (error) {
      thrown = error
    }
    expect(String(thrown)).toContain('client-modules: 1 client package failed to compose:')
    expect(String(thrown)).toContain('  other failures:')
    expect(String(thrown)).toContain('EISDIR')
    expect(String(thrown)).not.toContain('pnpm run build')
  })

  it('serves the source map beside a registered client bundle', async () => {
    const packageName = '@fixture/source-map'
    const clientPath = writePackage(packageName)
    mkdirSync(dirname(clientPath), { recursive: true })
    writeFileSync(clientPath, 'module.exports = {}\n')
    const map = '{"version":3,"sources":["src/client/index.tsx"]}\n'
    writeFileSync(`${clientPath}.map`, map)
    const { route } = constructWithRoute([packageName])
    let status = 0
    let headers: Record<string, string> | undefined
    let body = ''
    const response = {
      writeHead(nextStatus: number, nextHeaders?: Record<string, string>) {
        status = nextStatus
        headers = nextHeaders
        return response
      },
      end(chunk?: Uint8Array) {
        body = chunk === undefined ? '' : Buffer.from(chunk).toString('utf8')
        return response
      },
    } as unknown as ServerResponse

    await route.handler({
      method: 'GET',
      url: `/plugins/${packageName}/client.js.map`,
    } as IncomingMessage, response)

    expect(status).toBe(200)
    expect(headers).toEqual({
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-cache',
    })
    expect(body).toBe(map)
  })

  it('serves Ghostty wasm beside a registered client bundle', async () => {
    const packageName = '@fixture/ghostty-assets'
    const clientPath = writePackage(packageName)
    mkdirSync(dirname(clientPath), { recursive: true })
    writeFileSync(clientPath, 'module.exports = {}\n')
    mkdirSync(join(dirname(clientPath), 'assets'), { recursive: true })
    const wasm = Buffer.from('wasm-bytes')
    writeFileSync(join(dirname(clientPath), 'assets', 'ghostty-vt.wasm'), wasm)
    const { route } = constructWithRoute([packageName])
    let status = 0
    let headers: Record<string, string> | undefined
    let body = Buffer.alloc(0)
    const response = {
      writeHead(nextStatus: number, nextHeaders?: Record<string, string>) {
        status = nextStatus
        headers = nextHeaders
        return response
      },
      end(chunk?: Uint8Array) {
        body = chunk === undefined ? Buffer.alloc(0) : Buffer.from(chunk)
        return response
      },
    } as unknown as ServerResponse

    await route.handler({
      method: 'GET',
      url: `/plugins/${packageName}/assets/ghostty-vt.wasm`,
    } as IncomingMessage, response)

    expect(status).toBe(200)
    expect(headers).toEqual({
      'content-type': 'application/wasm',
      'cache-control': 'no-cache',
    })
    expect(body.equals(wasm)).toBe(true)

    writeFileSync(join(dirname(clientPath), 'assets', 'SymbolsNerdFontMono-Regular.woff2'), Buffer.from('font'))
    await route.handler({
      method: 'GET',
      url: `/plugins/${packageName}/assets/SymbolsNerdFontMono-Regular.woff2`,
    } as IncomingMessage, response)
    expect(status).toBe(200)
    expect(headers).toEqual({
      'content-type': 'font/woff2',
      'cache-control': 'no-cache',
    })

    await route.handler({
      method: 'GET',
      url: `/plugins/${packageName}/assets/../secret.wasm`,
    } as IncomingMessage, response)
    expect(status).toBe(404)

    await route.handler({
      method: 'GET',
      url: `/plugins/${packageName}/assets/missing.wasm`,
    } as IncomingMessage, response)
    expect(status).toBe(404)

    writeFileSync(join(dirname(clientPath), 'assets', 'notes.txt'), 'note')
    await route.handler({
      method: 'GET',
      url: `/plugins/${packageName}/assets/notes.txt`,
    } as IncomingMessage, response)
    expect(status).toBe(200)
    expect(headers).toEqual({
      'content-type': 'application/octet-stream',
      'cache-control': 'no-cache',
    })
  })
})

describe('host-feature compatibility gate', () => {
  /** Write a web client package whose manifest carries the given dsh section and a built bundle. */
  function writeCompatibleClient(packageName: string, dsh: Record<string, unknown>): void {
    const clientPath = writePackage(packageName, { dsh })
    mkdirSync(dirname(clientPath), { recursive: true })
    writeFileSync(clientPath, 'module.exports = {}\n')
  }

  it('accepts a package whose required features are all host-supported', () => {
    const packageName = '@fixture/features-ok'
    writeCompatibleClient(packageName, {
      client: { platform: 'web' },
      compatibility: { features: ['conversation.chat.user-actions', 'session.fork.beforeSeq', 'session.fork.blank'] },
    })
    expect(construct([packageName]).graph().entries.map(entry => entry.id)).toEqual([packageName])
  })

  it('accepts a package declaring compatibility with no requirements', () => {
    const packageName = '@fixture/features-empty'
    writeCompatibleClient(packageName, { client: { platform: 'web' }, compatibility: {} })
    expect(construct([packageName]).graph().entries.map(entry => entry.id)).toEqual([packageName])
  })

  it('rejects a package requiring missing host features, naming package and features', () => {
    const packageName = '@fixture/features-missing'
    writeCompatibleClient(packageName, {
      client: { platform: 'web' },
      compatibility: { features: ['conversation.chat.user-actions', 'editor.unsupported'] },
    })
    expect(() => construct([packageName])).toThrow([
      `client-modules: ${packageName} requires host features this dsh host does not support: editor.unsupported`,
      '  the package is not part of the boot graph — update dsh to a host that provides them, or remove the plugin',
    ].join('\n'))
  })

  it('rejects a malformed dsh.compatibility declaration, naming the package', () => {
    const packageName = '@fixture/features-malformed'
    writeCompatibleClient(packageName, {
      client: { platform: 'web' },
      compatibility: { features: 'conversation.chat.user-actions' },
    })
    expect(() => construct([packageName]))
      .toThrow(`${packageName}: dsh.compatibility.features must be a string array of feature ids`)
  })

  it('does not gate packages without a web client declaration', () => {
    // A non-web package's compatibility is out of the module graph's scope
    // (the install gate in `dsh plugin` owns every dependency); it must not
    // fail the composition.
    const packageName = '@fixture/features-node-only'
    writePackage(packageName, {
      dsh: { client: { platform: 'node' }, compatibility: { features: ['editor.unsupported'] } },
    })
    expect(construct([packageName]).graph().entries).toEqual([])
  })
})
