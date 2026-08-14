/**
 * createSurfacesStore: open files then close returns to the empty session.
 */
import { describe, expect, it } from 'vitest'
import { createSurfacesStore, sessionSurfaces } from '../src/client/stores.ts'

const SESSION = 'session-1'

describe('createSurfacesStore', () => {
  it('starts with no sessions', () => {
    const { store } = createSurfacesStore().create()
    expect(store.getSnapshot()).toEqual({ bySession: {} })
  })

  it('open files records the files singleton and close returns to empty', () => {
    const { store, actions } = createSurfacesStore().create()
    actions.open(SESSION, 'files')
    expect(sessionSurfaces(store.getSnapshot(), SESSION)).toEqual({
      activeId: 'files',
      surfaces: [{ id: 'files', kind: 'files' }],
    })
    actions.close(SESSION, 'files')
    expect(store.getSnapshot()).toEqual({ bySession: {} })
    expect(sessionSurfaces(store.getSnapshot(), SESSION)).toEqual({
      activeId: null,
      surfaces: [],
    })
  })

  it('open upserts preview, terminal, and the other singletons without duplicating', () => {
    const { store, actions } = createSurfacesStore().create()
    actions.open(SESSION, 'preview')
    actions.open(SESSION, 'preview')
    actions.open(SESSION, 'terminal')
    actions.open(SESSION, 'diff')
    actions.open(SESSION, 'agents')
    const bucket = sessionSurfaces(store.getSnapshot(), SESSION)
    expect(bucket.surfaces.map(surface => surface.kind)).toEqual([
      'preview', 'terminal', 'diff', 'agents',
    ])
    expect(bucket.surfaces.find(surface => surface.kind === 'preview')).toEqual({
      id: 'browser:new', kind: 'preview', resourceId: null,
    })
    expect(bucket.surfaces.find(surface => surface.kind === 'terminal')).toEqual({
      id: 'terminal:new', kind: 'terminal', terminalIds: [], activeTerminalId: '',
    })
    expect(bucket.activeId).toBe('agents')
  })

  it('activate, closeOthers, closeToRight, and closeAll edit one session only', () => {
    const { store, actions } = createSurfacesStore().create()
    actions.open(SESSION, 'files')
    actions.open(SESSION, 'diff')
    actions.open(SESSION, 'agents')
    actions.open('session-2', 'files')
    actions.activate(SESSION, 'files')
    expect(sessionSurfaces(store.getSnapshot(), SESSION).activeId).toBe('files')

    actions.closeToRight(SESSION, 'files')
    expect(sessionSurfaces(store.getSnapshot(), SESSION).surfaces.map(surface => surface.id)).toEqual(['files'])

    actions.open(SESSION, 'diff')
    actions.closeOthers(SESSION, 'diff')
    expect(sessionSurfaces(store.getSnapshot(), SESSION)).toEqual({
      activeId: 'diff',
      surfaces: [{ id: 'diff', kind: 'diff' }],
    })
    expect(sessionSurfaces(store.getSnapshot(), 'session-2').surfaces).toEqual([
      { id: 'files', kind: 'files' },
    ])

    actions.closeAll(SESSION)
    expect(store.getSnapshot().bySession[SESSION]).toBeUndefined()
    expect(sessionSurfaces(store.getSnapshot(), 'session-2').surfaces).toHaveLength(1)
  })
})
