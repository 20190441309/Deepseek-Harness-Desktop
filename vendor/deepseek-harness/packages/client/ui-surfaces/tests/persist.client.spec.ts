// @vitest-environment jsdom
/**
 * Surfaces persist: round-trip and drop unknown kinds.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  cancelPersist, loadPersistedState, persistSession, readBucket, SURFACES_PERSIST_PREFIX, writeSession,
} from '../src/client/persist.ts'
import { createSurfacesStore, sessionSurfaces } from '../src/client/stores.ts'

afterEach(() => {
  localStorage.clear()
  vi.useRealTimers()
})

describe('surfaces persist', () => {
  it('round-trips a files tab plus a file surface', () => {
    writeSession('sess-1', {
      activeId: 'file:a.ts',
      surfaces: [
        { id: 'files', kind: 'files' },
        { id: 'file:a.ts', kind: 'file', relativePath: 'a.ts' },
      ],
    })
    const loaded = loadPersistedState()
    expect(sessionSurfaces(loaded, 'sess-1')).toEqual({
      activeId: 'file:a.ts',
      surfaces: [
        { id: 'files', kind: 'files' },
        { id: 'file:a.ts', kind: 'file', relativePath: 'a.ts' },
      ],
    })
  })

  it('drops unknown kinds and keeps the rest', () => {
    const bucket = readBucket(JSON.stringify({
      activeId: 'mystery',
      surfaces: [
        { id: 'files', kind: 'files' },
        { id: 'x', kind: 'portal' },
        { id: 'file:nopath', kind: 'file' },
        { id: 'diff', kind: 'diff' },
      ],
    }))
    expect(bucket).toEqual({
      activeId: 'files',
      surfaces: [
        { id: 'files', kind: 'files' },
        { id: 'diff', kind: 'diff' },
      ],
    })
  })

  it('createSurfacesStore init hydrates from localStorage', () => {
    localStorage.setItem(`${SURFACES_PERSIST_PREFIX}sess-1`, JSON.stringify({
      activeId: 'files',
      surfaces: [{ id: 'files', kind: 'files' }],
    }))
    const { store } = createSurfacesStore().create()
    expect(sessionSurfaces(store.getSnapshot(), 'sess-1').surfaces).toEqual([
      { id: 'files', kind: 'files' },
    ])
  })

  it('writeSession removes the key when the bucket is empty', () => {
    writeSession('sess-1', {
      activeId: 'files',
      surfaces: [{ id: 'files', kind: 'files' }],
    })
    writeSession('sess-1', { activeId: null, surfaces: [] })
    expect(localStorage.getItem(`${SURFACES_PERSIST_PREFIX}sess-1`)).toBeNull()
  })

  it('debounces persistSession and cancelPersist drops the pending write', () => {
    vi.useFakeTimers()
    persistSession('sess-1', {
      activeId: 'files',
      surfaces: [{ id: 'files', kind: 'files' }],
    })
    expect(localStorage.getItem(`${SURFACES_PERSIST_PREFIX}sess-1`)).toBeNull()
    vi.advanceTimersByTime(80)
    expect(localStorage.getItem(`${SURFACES_PERSIST_PREFIX}sess-1`)).toContain('files')
    persistSession('sess-1', {
      activeId: 'diff',
      surfaces: [{ id: 'diff', kind: 'diff' }],
    })
    persistSession('sess-1', {
      activeId: 'agents',
      surfaces: [{ id: 'agents', kind: 'agents' }],
    })
    cancelPersist('sess-1')
    vi.advanceTimersByTime(80)
    expect(localStorage.getItem(`${SURFACES_PERSIST_PREFIX}sess-1`)).toContain('files')
    persistSession('', { activeId: null, surfaces: [] })
    cancelPersist('missing')
  })

  it('sanitizes preview, terminal, and malformed payloads', () => {
    expect(readBucket(null)).toBeUndefined()
    expect(readBucket('')).toBeUndefined()
    expect(readBucket('{')).toBeUndefined()
    expect(readBucket('1')).toBeUndefined()
    expect(readBucket(JSON.stringify({ surfaces: 'nope' }))).toBeUndefined()
    expect(readBucket(JSON.stringify({ surfaces: [{ kind: 'portal' }] }))).toBeUndefined()
    localStorage.setItem('other', '1')
    localStorage.setItem(SURFACES_PERSIST_PREFIX, '{}')
    const bucket = readBucket(JSON.stringify({
      activeId: 'browser:new',
      surfaces: [
        { id: 'wrong', kind: 'files' },
        { id: 'wrong', kind: 'diff' },
        { id: 'wrong', kind: 'agents' },
        { id: 'agents', kind: 'agents' },
        { id: 'browser:new', kind: 'preview', resourceId: 'r1' },
        { id: 'terminal:new', kind: 'terminal', terminalIds: ['a', 1], activeTerminalId: 'a' },
        { id: 'file:nopath', kind: 'file', relativePath: '' },
        null,
      ],
    }))
    expect(bucket?.surfaces).toEqual([
      { id: 'agents', kind: 'agents' },
      { id: 'browser:new', kind: 'preview', resourceId: 'r1' },
      { id: 'terminal:new', kind: 'terminal', terminalIds: ['a'], activeTerminalId: 'a' },
    ])
    expect(readBucket(JSON.stringify({
      activeId: 'p',
      surfaces: [{ id: 'p', kind: 'preview' }, { id: 't', kind: 'terminal' }],
    }))?.surfaces).toEqual([
      { id: 'p', kind: 'preview', resourceId: null },
      { id: 't', kind: 'terminal', terminalIds: [], activeTerminalId: '' },
    ])
    expect(loadPersistedState().bySession).toEqual({})
    localStorage.setItem(`${SURFACES_PERSIST_PREFIX}bad`, '{')
    expect(loadPersistedState().bySession).toEqual({})
  })

  it('no-ops when storage is unavailable', () => {
    expect(loadPersistedState(undefined).bySession).toEqual({})
    persistSession('sess-1', {
      activeId: 'files',
      surfaces: [{ id: 'files', kind: 'files' }],
    }, undefined)
    writeSession('sess-1', {
      activeId: 'files',
      surfaces: [{ id: 'files', kind: 'files' }],
    }, undefined)
  })
})
