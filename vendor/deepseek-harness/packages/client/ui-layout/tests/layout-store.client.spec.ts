// @vitest-environment jsdom
/**
 * createLayoutStore unit account: init shape, the action write set (clamp
 * inside actions), and surfaces/drawer persistence. Uses the
 * test-sanctioned path: factory self-call + .create() gives the
 * real engine instance (same create path as production).
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { LAYOUT_PERSIST_KEY } from '@deepseek-ai/dsh-client-ui-layout/src/client/persist.ts'
import { createLayoutStore } from '@deepseek-ai/dsh-client-ui-layout/src/client/stores.ts'
import {
  DETAILS_DEFAULT, DETAILS_MAX, DETAILS_MIN,
  SIDEBAR_DEFAULT, SIDEBAR_MAX, SIDEBAR_MIN,
  SURFACES_DEFAULT, SURFACES_MAX, SURFACES_MIN,
  TERMINAL_DRAWER_MIN,
} from '@deepseek-ai/dsh-client-ui-layout/src/client/columns.ts'

beforeEach(() => { localStorage.clear() })

describe('createLayoutStore', () => {
  it('initializes the sidebar at its default width, details closed, wide viewport assumed', () => {
    const { store } = createLayoutStore().create()
    expect(store.getSnapshot()).toEqual({
      sidebar: SIDEBAR_DEFAULT, details: 0, surfaces: 0, terminalDrawer: 0, narrow: false, narrowExpanded: false,
    })
  })

  it('each create() is an independent instance (factory is not a singleton)', () => {
    const a = createLayoutStore().create()
    const b = createLayoutStore().create()
    a.actions.setSidebar(400)
    expect(b.store.getSnapshot().sidebar).toBe(SIDEBAR_DEFAULT)
  })

  it('setSidebar/setDetails clamp into the contract ranges', () => {
    const { store, actions } = createLayoutStore().create()
    actions.setSidebar(1)
    expect(store.getSnapshot().sidebar).toBe(SIDEBAR_MIN)
    actions.setSidebar(9999)
    expect(store.getSnapshot().sidebar).toBe(SIDEBAR_MAX)
    actions.setDetails(1)
    expect(store.getSnapshot().details).toBe(DETAILS_MIN)
    actions.setDetails(9999)
    expect(store.getSnapshot().details).toBe(DETAILS_MAX)
  })

  it('toggleSidebar flips closed <-> contract default (drag width forgotten)', () => {
    const { store, actions } = createLayoutStore().create()
    actions.setSidebar(400)
    actions.toggleSidebar()
    expect(store.getSnapshot().sidebar).toBe(0)
    actions.toggleSidebar()
    expect(store.getSnapshot().sidebar).toBe(SIDEBAR_DEFAULT)
  })

  it('narrow toggleSidebar flips only the re-expand override; the width preference survives', () => {
    const { store, actions } = createLayoutStore().create()
    actions.setSidebar(400)
    actions.setNarrow(true)
    actions.toggleSidebar()
    expect(store.getSnapshot()).toEqual({
      sidebar: 400, details: 0, surfaces: 0, terminalDrawer: 0, narrow: true, narrowExpanded: true,
    })
    actions.toggleSidebar()
    expect(store.getSnapshot().narrowExpanded).toBe(false)
    expect(store.getSnapshot().sidebar).toBe(400)
  })

  it('crossing the breakpoint drops the override; a same-value setNarrow keeps it', () => {
    const { store, actions } = createLayoutStore().create()
    actions.setNarrow(true)
    actions.toggleSidebar()
    expect(store.getSnapshot().narrowExpanded).toBe(true)
    actions.setNarrow(true)
    expect(store.getSnapshot().narrowExpanded).toBe(true)
    actions.setNarrow(false)
    expect(store.getSnapshot()).toMatchObject({ narrow: false, narrowExpanded: false })
    actions.setNarrow(true)
    expect(store.getSnapshot().narrowExpanded).toBe(false)
  })

  it('closeNarrowSidebar drops the override and leaves the width preference', () => {
    const { store, actions } = createLayoutStore().create()
    actions.setSidebar(400)
    actions.setNarrow(true)
    actions.toggleSidebar()
    expect(store.getSnapshot().narrowExpanded).toBe(true)
    actions.closeNarrowSidebar()
    expect(store.getSnapshot()).toMatchObject({ sidebar: 400, narrow: true, narrowExpanded: false })
  })

  it('openDetails uses the contract default, preserves an open width, and closeDetails zeroes', () => {
    const { store, actions } = createLayoutStore().create()
    actions.openDetails()
    expect(store.getSnapshot().details).toBe(DETAILS_DEFAULT)
    actions.setDetails(500)
    actions.openDetails()
    expect(store.getSnapshot().details).toBe(500)
    actions.closeDetails()
    expect(store.getSnapshot().details).toBe(0)
  })

  it('persists surfaces and drawer sizes and hydrates them on the next create', () => {
    const first = createLayoutStore().create()
    first.actions.setSidebar(400)
    first.actions.openDetails()
    first.actions.setDetails(500)
    first.actions.setSurfaces(500)
    first.actions.setTerminalDrawer(320)
    expect(localStorage.getItem(LAYOUT_PERSIST_KEY)).not.toBeNull()

    const second = createLayoutStore().create()
    expect(second.store.getSnapshot()).toEqual({
      sidebar: SIDEBAR_DEFAULT,
      details: 0,
      surfaces: 500,
      terminalDrawer: 320,
      narrow: false,
      narrowExpanded: false,
    })
  })

  it('toggleSurfaces restores the last drag width instead of the contract default', () => {
    const { store, actions } = createLayoutStore().create()
    actions.setSurfaces(500)
    actions.toggleSurfaces()
    expect(store.getSnapshot().surfaces).toBe(0)
    actions.toggleSurfaces()
    expect(store.getSnapshot().surfaces).toBe(500)
  })

  it('openSurfaces uses the contract default, preserves an open width, and closeSurfaces zeroes', () => {
    const { store, actions } = createLayoutStore().create()
    actions.openSurfaces()
    expect(store.getSnapshot().surfaces).toBe(SURFACES_DEFAULT)
    actions.setSurfaces(500)
    actions.openSurfaces()
    expect(store.getSnapshot().surfaces).toBe(500)
    actions.closeSurfaces()
    expect(store.getSnapshot().surfaces).toBe(0)
  })

  it('setSurfaces clamps into the contract range', () => {
    const { store, actions } = createLayoutStore().create()
    actions.setSurfaces(1)
    expect(store.getSnapshot().surfaces).toBe(SURFACES_MIN)
    actions.setSurfaces(9999)
    expect(store.getSnapshot().surfaces).toBe(SURFACES_MAX)
  })

  it('toggleTerminalDrawer restores the last drag height', () => {
    const { store, actions } = createLayoutStore().create()
    actions.setTerminalDrawer(360)
    actions.toggleTerminalDrawer()
    expect(store.getSnapshot().terminalDrawer).toBe(0)
    actions.toggleTerminalDrawer()
    expect(store.getSnapshot().terminalDrawer).toBe(360)
  })

  it('setTerminalDrawer clamps to the floor and never writes closed', () => {
    const { store, actions } = createLayoutStore().create()
    actions.setTerminalDrawer(1)
    expect(store.getSnapshot().terminalDrawer).toBe(TERMINAL_DRAWER_MIN)
    actions.setTerminalDrawer(480)
    expect(store.getSnapshot().terminalDrawer).toBe(480)
  })
})
