/**
 * Profile boot helpers: skip-user-plugins compose uses template bundles,
 * skips user and home patch files, and still applies `--patch` overlays.
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  initProfile,
  PROFILE_PATCH_FILENAME,
  PROFILE_TEMPLATES,
  PROFILES_DIR,
  readProfileManifest,
} from '@deepseek-ai/dsh-app-boot'
import { homePatchPath, composeProfile, prepareProfile, userPatchWatchFiles } from '../src/profile-boot.ts'

const tmpDirs: string[] = []
const tmp = (): string => {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-profile-boot-'))
  tmpDirs.push(dir)
  return dir
}

afterEach(() => {
  vi.unstubAllEnvs()
  for (const dir of tmpDirs) rmSync(dir, { recursive: true, force: true })
  tmpDirs.length = 0
})

describe('prepareProfile', () => {
  it('template selection skips the user layer and does not rewrite the manifest', () => {
    const home = tmp()
    vi.stubEnv('DSH_HOME', home)
    const dir = join(home, PROFILES_DIR, 'web')
    const listed = [...PROFILE_TEMPLATES.web ?? [], 'ghost-bundle']
    initProfile(dir, listed)
    writeFileSync(join(dir, PROFILE_PATCH_FILENAME), 'not: a list\n')
    const profile = prepareProfile('web', { userLayer: false, bundles: 'template' })
    expect(profile.layers.map(layer => layer.packageName)).toEqual([...PROFILE_TEMPLATES.web ?? []])
    expect(profile.patches).toEqual([])
    expect(readProfileManifest('dsh', dir).dsh?.profile?.bundles).toEqual(listed)
    expect(homePatchPath()).toBe(join(home, PROFILE_PATCH_FILENAME))
  })
})

describe('composeProfile skip-user-plugins', () => {
  it('skips invalid profile and home user patches, keeps --patch, and does not watch them', () => {
    const home = tmp()
    vi.stubEnv('DSH_HOME', home)
    const dir = join(home, PROFILES_DIR, 'web')
    initProfile(dir, [...PROFILE_TEMPLATES.web ?? [], 'ghost-bundle'])
    writeFileSync(join(dir, PROFILE_PATCH_FILENAME), 'not: a list\n')
    writeFileSync(join(home, PROFILE_PATCH_FILENAME), 'also: invalid\n')
    const overlay = join(home, 'extra.yml')
    writeFileSync(overlay, '- id: session-telemetry-otel\n  disabled: true\n')
    const composed = composeProfile('web', [overlay], true)
    expect(composed.profile.layers.map(layer => layer.packageName)).toEqual([...PROFILE_TEMPLATES.web ?? []])
    expect(composed.profile.patches).toEqual([])
    expect(composed.homePatches).toEqual([])
    expect(composed.overlays).toEqual(
      expect.arrayContaining([{ id: 'session-telemetry-otel', disabled: true }]),
    )
    expect(userPatchWatchFiles(composed.profile.patchPath, true)).toEqual([])
    expect(userPatchWatchFiles(composed.profile.patchPath, false)).toEqual([
      composed.profile.patchPath,
      homePatchPath(),
    ])
  })
})
