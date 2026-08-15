/**
 * Profile plugin management: the pure bundle-layer reconciliation (bundle
 * activation, deactivation, and the fail-closed host-feature gate) plus the
 * `runPlugin` end-to-end exit contract — a successful pnpm run still returns
 * nonzero when a dependency fails the gate, with rollback of newly-added
 * incompatible packages and clear diagnostics for pre-existing ones.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { readProfileManifest, writeProfileManifest, type ProfileManifest } from '@deepseek-ai/dsh-app-boot'
import { compatibilityFailureOf, reconcileBundleLayers, runPlugin } from '../src/plugin.ts'

/** The slice of a spawnSync result runPlugin reads. */
interface SpawnResult { status: number | null; error: Error | undefined }
type SpawnSyncMock = (command: string, args: readonly string[]) => SpawnResult

const { spawnSyncMock } = vi.hoisted(() => ({ spawnSyncMock: vi.fn<SpawnSyncMock>() }))
vi.mock('node:child_process', () => ({ spawnSync: spawnSyncMock }))

/** Temp homes staged by the runPlugin tests, cleaned after each test. */
const tmpDirs: string[] = []
const tmp = (): string => {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-plugin-'))
  tmpDirs.push(dir)
  return dir
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  spawnSyncMock.mockClear()
  for (const dir of tmpDirs) rmSync(dir, { recursive: true, force: true })
  tmpDirs.length = 0
})

/** A dependency manifest; `dsh` omitted entirely means "no declaration". */
function depManifest(dsh?: Record<string, unknown>): ProfileManifest {
  return { name: 'dep', ...(dsh === undefined ? {} : { dsh }) }
}

/** Resolver over a name -> manifest table; absent names read as unresolvable. */
function resolver(table: Record<string, ProfileManifest | undefined>) {
  return (packageName: string): ProfileManifest | undefined => table[packageName]
}

const manifest = (dsh: Record<string, unknown>): ProfileManifest => ({
  name: 'p',
  dependencies: {},
  dsh,
})

describe('compatibilityFailureOf', () => {
  it('passes packages without a compatibility declaration or with supported requirements', () => {
    expect(compatibilityFailureOf('pkg', depManifest())).toBeUndefined()
    expect(compatibilityFailureOf('pkg', depManifest({ compatibility: { features: ['session.fork.blank'] } })))
      .toBeUndefined()
    expect(compatibilityFailureOf('pkg', depManifest({ compatibility: {} }))).toBeUndefined()
    expect(compatibilityFailureOf('pkg', undefined)).toBeUndefined()
  })

  it('fails closed on missing host features with the unsupported ids', () => {
    expect(compatibilityFailureOf('pkg', depManifest({ compatibility: { features: ['editor.unsupported'] } })))
      .toEqual({ packageName: 'pkg', kind: 'missing-features', missing: ['editor.unsupported'] })
  })

  it('fails closed on a malformed declaration with the parse detail', () => {
    const failure = compatibilityFailureOf('pkg', depManifest({ compatibility: { features: 'editor.unsupported' } }))
    expect(failure?.kind).toBe('malformed')
    expect(failure?.detail).toContain('pkg: dsh.compatibility.features must be a string array')
  })
})

describe('reconcileBundleLayers', () => {
  it('activates bundle dependencies, preserving packages without a compatibility declaration', () => {
    const before = manifest({ profile: { bundles: ['@deepseek-ai/dsh-base'] } })
    const after: ProfileManifest = {
      ...manifest({ profile: { bundles: ['@deepseek-ai/dsh-base'] } }),
      dependencies: { 'plain-lib': '0.0.0', 'good-bundle': '0.0.0' },
    }
    const report = reconcileBundleLayers(before, after, resolver({
      'good-bundle': depManifest({ bundle: { patch: './cordis.patch.yml' } }),
      'plain-lib': depManifest(),
    }))
    expect(report.failures).toEqual([])
    expect(report.bundles).toEqual(['@deepseek-ai/dsh-base', 'good-bundle'])
    expect(report.plainAdditions).toEqual(['plain-lib'])
    expect(report.changed).toBe(true)
  })

  it('refuses activation of a dependency requiring missing host features', () => {
    const before = manifest({ profile: { bundles: [] } })
    const after: ProfileManifest = {
      ...manifest({ profile: { bundles: [] } }),
      dependencies: { 'incompatible-bundle': '0.0.0' },
    }
    const report = reconcileBundleLayers(before, after, resolver({
      'incompatible-bundle': depManifest({
        bundle: { patch: './cordis.patch.yml' },
        compatibility: { features: ['conversation.chat.user-actions', 'editor.unsupported'] },
      }),
    }))
    expect(report.failures).toEqual([{
      packageName: 'incompatible-bundle',
      kind: 'missing-features',
      missing: ['editor.unsupported'],
    }])
    expect(report.bundles).toEqual([])
    expect(report.plainAdditions).toEqual([])
    expect(report.changed).toBe(false)
  })

  it('refuses activation of a dependency with a malformed compatibility declaration', () => {
    const before = manifest({ profile: { bundles: [] } })
    const after: ProfileManifest = {
      ...manifest({ profile: { bundles: [] } }),
      dependencies: { 'broken-bundle': '0.0.0' },
    }
    const report = reconcileBundleLayers(before, after, resolver({
      'broken-bundle': depManifest({
        bundle: { patch: './cordis.patch.yml' },
        compatibility: 'not-an-object',
      }),
    }))
    expect(report.failures).toHaveLength(1)
    expect(report.failures[0]).toMatchObject({ packageName: 'broken-bundle', kind: 'malformed' })
    expect(report.bundles).toEqual([])
  })

  it('deactivates an active bundle whose updated version fails the gate', () => {
    const before = manifest({ profile: { bundles: ['edgy-bundle'] } })
    const after: ProfileManifest = {
      ...manifest({ profile: { bundles: ['edgy-bundle'] } }),
      dependencies: { 'edgy-bundle': '0.0.0' },
    }
    const report = reconcileBundleLayers(before, after, resolver({
      'edgy-bundle': depManifest({
        bundle: { patch: './cordis.patch.yml' },
        compatibility: { features: ['editor.unsupported'] },
      }),
    }))
    expect(report.failures).toEqual([{
      packageName: 'edgy-bundle',
      kind: 'missing-features',
      missing: ['editor.unsupported'],
    }])
    expect(report.bundles).toEqual([])
    expect(report.deactivated).toEqual(['edgy-bundle'])
    expect(report.changed).toBe(true)
  })

  it('removes a dependency that stopped being a bundle and keeps template bundles', () => {
    const before = manifest({ profile: { bundles: ['@deepseek-ai/dsh-base', 'retired-bundle'] } })
    const after: ProfileManifest = {
      ...manifest({ profile: { bundles: ['@deepseek-ai/dsh-base', 'retired-bundle'] } }),
      dependencies: { 'retired-bundle': '0.0.0' },
    }
    const report = reconcileBundleLayers(before, after, resolver({ 'retired-bundle': depManifest() }))
    expect(report.failures).toEqual([])
    expect(report.bundles).toEqual(['@deepseek-ai/dsh-base'])
    expect(report.deactivated).toEqual(['retired-bundle'])
  })

  it('reports newly-added bundle-less dependencies as plain additions only', () => {
    const before = manifest({ profile: { bundles: [] } })
    const after: ProfileManifest = {
      ...manifest({ profile: { bundles: [] } }),
      dependencies: { 'plain-lib': '0.0.0' },
    }
    const report = reconcileBundleLayers(before, after, resolver({ 'plain-lib': depManifest() }))
    expect(report.failures).toEqual([])
    expect(report.plainAdditions).toEqual(['plain-lib'])
    expect(report.changed).toBe(false)
  })
})

describe('runPlugin', () => {
  /** Stage a profile manifest plus resolvable installed dependencies under `home`. */
  function stageProfile(
    home: string,
    profile: string,
    manifest: ProfileManifest,
    installed: Record<string, ProfileManifest> = {},
  ): string {
    const dir = join(home, 'profiles', profile)
    mkdirSync(join(dir, 'node_modules'), { recursive: true })
    for (const [name, dep] of Object.entries(installed)) {
      mkdirSync(join(dir, 'node_modules', ...name.split('/')), { recursive: true })
      writeFileSync(join(dir, 'node_modules', ...name.split('/'), 'package.json'), JSON.stringify(dep))
    }
    writeProfileManifest(dir, manifest)
    return dir
  }

  /** Collect stderr writes while `fn` runs, and return the exit code plus lines. */
  function stderrOf(fn: () => number): { code: number; stderr: string[] } {
    const lines: string[] = []
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk: unknown) => {
      lines.push(String(chunk))
      return true
    })
    const code = fn()
    return { code, stderr: lines }
  }

  it('returns nonzero and rolls back a newly-added incompatible dependency', () => {
    const home = tmp()
    const dir = stageProfile(home, 'tui', {
      name: 'dsh-profile-tui',
      dependencies: {},
      dsh: { profile: { bundles: ['@deepseek-ai/dsh-base'] } },
    })
    // pnpm add succeeds and writes the dependency + package; pnpm remove
    // (the rollback) succeeds and removes it again.
    spawnSyncMock.mockImplementation((command, args) => {
      if (command === 'pnpm' && args[0] === 'add') {
        const after = readProfileManifest('t', dir)
        after.dependencies = { 'bad-plugin': '1.0.0' }
        writeProfileManifest(dir, after)
        mkdirSync(join(dir, 'node_modules', 'bad-plugin'), { recursive: true })
        writeFileSync(join(dir, 'node_modules', 'bad-plugin', 'package.json'), JSON.stringify({
          name: 'bad-plugin',
          version: '1.0.0',
          dsh: {
            bundle: { patch: './cordis.patch.yml' },
            compatibility: { features: ['editor.unsupported'] },
          },
        }))
        return { status: 0, error: undefined }
      }
      if (command === 'pnpm' && args[0] === 'remove') {
        const after = readProfileManifest('t', dir)
        delete after.dependencies?.['bad-plugin']
        writeProfileManifest(dir, after)
        return { status: 0, error: undefined }
      }
      throw new Error(`unexpected spawn: ${command} ${args.join(' ')}`)
    })
    vi.stubEnv('DSH_HOME', home)
    const { code, stderr } = stderrOf(() => runPlugin('tui', ['add', 'bad-plugin']))
    expect(code).toBe(1)
    expect(stderr.join('')).toContain(
      'bad-plugin requires host features this dsh does not support: editor.unsupported',
    )
    expect(stderr.join('')).toContain('bad-plugin was not activated in dsh.profile.bundles')
    expect(stderr.join('')).toContain('bad-plugin was rolled back')
    // The rollback removed the dependency and the bundle list never gained it.
    const final = readProfileManifest('t', dir)
    expect(final.dependencies).toEqual({})
    expect(final.dsh?.profile?.bundles).toEqual(['@deepseek-ai/dsh-base'])
  })

  it('returns nonzero for a pre-existing incompatible dependency, keeping it installed but inactive', () => {
    const home = tmp()
    const dir = stageProfile(home, 'tui', {
      name: 'dsh-profile-tui',
      dependencies: { 'bad-plugin': '1.0.0' },
      dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', 'bad-plugin'] } },
    }, {
      'bad-plugin': {
        name: 'bad-plugin',
        dsh: {
          bundle: { patch: './cordis.patch.yml' },
          compatibility: { features: ['editor.unsupported'] },
        },
      },
    })
    // pnpm update succeeds; the dependency stays where it was.
    spawnSyncMock.mockReturnValue({ status: 0, error: undefined })
    vi.stubEnv('DSH_HOME', home)
    const { code, stderr } = stderrOf(() => runPlugin('tui', ['update']))
    expect(code).toBe(1)
    expect(spawnSyncMock).toHaveBeenCalledTimes(1) // no rollback attempt for a pre-existing dependency
    expect(stderr.join('')).toContain('bad-plugin requires host features this dsh does not support: editor.unsupported')
    expect(stderr.join('')).toContain('bad-plugin remains installed as an inactive dependency')
    const final = readProfileManifest('t', dir)
    expect(final.dependencies).toEqual({ 'bad-plugin': '1.0.0' }) // user dependency untouched
    expect(final.dsh?.profile?.bundles).toEqual(['@deepseek-ai/dsh-base']) // deactivated
  })

  it('returns pnpm exit codes and reconciles a clean install without the gate', () => {
    const home = tmp()
    const dir = stageProfile(home, 'tui', {
      name: 'dsh-profile-tui',
      dependencies: {},
      dsh: { profile: { bundles: ['@deepseek-ai/dsh-base'] } },
    })
    spawnSyncMock.mockImplementation((command, args) => {
      if (command === 'pnpm' && args[0] === 'add') {
        const after = readProfileManifest('t', dir)
        after.dependencies = { 'good-bundle': '1.0.0' }
        writeProfileManifest(dir, after)
        mkdirSync(join(dir, 'node_modules', 'good-bundle'), { recursive: true })
        writeFileSync(join(dir, 'node_modules', 'good-bundle', 'package.json'), JSON.stringify({
          name: 'good-bundle',
          version: '1.0.0',
          dsh: { bundle: { patch: './cordis.patch.yml' } },
        }))
        return { status: 0, error: undefined }
      }
      throw new Error(`unexpected spawn: ${command} ${args.join(' ')}`)
    })
    vi.stubEnv('DSH_HOME', home)
    const { code } = stderrOf(() => runPlugin('tui', ['add', 'good-bundle']))
    expect(code).toBe(0)
    const final = readProfileManifest('t', dir)
    expect(final.dsh?.profile?.bundles).toEqual(['@deepseek-ai/dsh-base', 'good-bundle'])
  })

  it('passes through a pnpm failure exit code without reconciling', () => {
    const home = tmp()
    stageProfile(home, 'tui', {
      name: 'dsh-profile-tui',
      dependencies: {},
      dsh: { profile: { bundles: ['@deepseek-ai/dsh-base'] } },
    })
    spawnSyncMock.mockReturnValue({ status: 7, error: undefined })
    vi.stubEnv('DSH_HOME', home)
    const { code } = stderrOf(() => runPlugin('tui', ['add', 'x']))
    expect(code).toBe(7)
    expect(readProfileManifest('t', join(home, 'profiles', 'tui')).dsh?.profile?.bundles)
      .toEqual(['@deepseek-ai/dsh-base'])
  })
})
