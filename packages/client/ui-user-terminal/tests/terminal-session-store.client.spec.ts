/**
 * Shared terminal session store: two shells activate the same id and see
 * one session record. Split honors MAX_TERMINALS_PER_GROUP.
 */
import { describe, expect, it } from 'vitest'
import {
  acquireCreate,
  createTerminalSessionStore,
  MAX_TERMINALS_PER_GROUP,
  releaseCreate,
} from '../src/client/stores.ts'

function sharedShells() {
  const instance = createTerminalSessionStore().create('session-1')
  return { drawer: instance, surface: instance }
}

describe('createTerminalSessionStore', () => {
  it('starts with no sessions and an empty active id', () => {
    const { store } = createTerminalSessionStore().create('session-1')
    expect(store.getSnapshot()).toEqual({
      sessions: [],
      activeId: '',
      groups: [],
      createFailed: false,
    })
  })

  it('lets two shells activate the same id and read one session record', () => {
    const { drawer, surface } = sharedShells()
    drawer.actions.newTerminal('term-a', '/work')
    surface.actions.activate('term-a')
    surface.actions.setSize('term-a', 120, 40)

    const drawerRecord = drawer.store.getSnapshot().sessions.find(session => session.id === 'term-a')
    const surfaceRecord = surface.store.getSnapshot().sessions.find(session => session.id === 'term-a')
    expect(drawer.store.getSnapshot().activeId).toBe('term-a')
    expect(surface.store.getSnapshot().activeId).toBe('term-a')
    expect(drawerRecord).toBe(surfaceRecord)
    expect(drawerRecord).toEqual({
      id: 'term-a',
      cwd: '/work',
      cols: 120,
      rows: 40,
      buffer: '',
    })
  })

  it('refuses split once the active group reaches MAX_TERMINALS_PER_GROUP', () => {
    const { store, actions } = createTerminalSessionStore().create('session-1')
    actions.newTerminal('t1', '/work')
    for (let index = 2; index <= MAX_TERMINALS_PER_GROUP; index += 1) {
      actions.split(`t${index}`, '/work')
    }
    expect(store.getSnapshot().sessions).toHaveLength(MAX_TERMINALS_PER_GROUP)
    expect(store.getSnapshot().groups[0]?.terminalIds).toHaveLength(MAX_TERMINALS_PER_GROUP)

    actions.split('overflow', '/work')
    expect(store.getSnapshot().sessions).toHaveLength(MAX_TERMINALS_PER_GROUP)
    expect(store.getSnapshot().sessions.some(session => session.id === 'overflow')).toBe(false)
    expect(store.getSnapshot().activeId).toBe(`t${MAX_TERMINALS_PER_GROUP}`)
  })

  it('newTerminal opens a separate group so split can continue', () => {
    const { store, actions } = createTerminalSessionStore().create('session-1')
    actions.newTerminal('t1', '/work')
    actions.split('t2', '/work')
    actions.newTerminal('t3', '/work')
    expect(store.getSnapshot().groups).toHaveLength(2)
    expect(store.getSnapshot().activeId).toBe('t3')
    actions.split('t4', '/work')
    expect(store.getSnapshot().groups[1]?.terminalIds).toEqual(['t3', 't4'])
  })

  it('close removes the session and activates a neighbor', () => {
    const { store, actions } = createTerminalSessionStore().create('session-1')
    actions.newTerminal('t1', '/work')
    actions.split('t2', '/work')
    actions.close('t2')
    expect(store.getSnapshot().sessions.map(session => session.id)).toEqual(['t1'])
    expect(store.getSnapshot().activeId).toBe('t1')
    actions.close('t1')
    expect(store.getSnapshot()).toEqual({ sessions: [], activeId: '', groups: [], createFailed: false })
  })

  it('shares one in-flight create lock across two shells on the same actions object', () => {
    const { drawer, surface } = sharedShells()
    expect(acquireCreate(drawer.actions)).toBe(true)
    expect(acquireCreate(surface.actions)).toBe(false)
    releaseCreate(drawer.actions)
    expect(acquireCreate(surface.actions)).toBe(true)
    releaseCreate(surface.actions)
  })

  it('dispatches PTY data and exit once to the shared instance', () => {
    const handle = createTerminalSessionStore()
    const instance = handle.create('session-1')
    instance.actions.newTerminal('pty-1', '/work')
    handle.dispatchData('pty-1', 'hello')
    handle.dispatchData('pty-1', '!')
    expect(instance.getSnapshot().sessions[0]?.buffer).toBe('hello!')
    handle.dispatchExit('pty-1')
    expect(instance.getSnapshot().sessions).toHaveLength(0)
  })
})
