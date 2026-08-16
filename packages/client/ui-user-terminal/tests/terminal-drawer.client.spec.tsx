// @vitest-environment jsdom
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { useSyncExternalStore } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

// xterm needs a real layout to fit; the pane integration is asserted against
// a scripted fake that records writes, data handlers, and disposal.
const xtermState = vi.hoisted(() => ({ instances: [] as Array<{
  writes: string[]
  dataHandlers: Array<(data: string) => void>
  selectionHandlers: Array<() => void>
  selection: string
  disposed: boolean
  cols: number
  rows: number
  fontFamily: string
  fontSize: number
  lineHeight: number
  getSelection: () => string
  hasSelection: () => boolean
  clearSelection: () => void
  onSelectionChange: (handler: () => void) => { dispose: () => void }
  registerLinkProvider: (provider: { provideLinks: (y: number, cb: (links: unknown) => void) => void }) => { dispose: () => void }
  linkProvider?: { provideLinks: (y: number, cb: (links: unknown) => void) => void }
  buffer: { active: { getLine: (index: number) => { translateToString: (trim?: boolean) => string } | undefined } }
}> }))

vi.mock('@xterm/xterm', () => {
  class FakeTerminal {
    cols = 80
    rows = 24
    writes: string[] = []
    dataHandlers: Array<(data: string) => void> = []
    selectionHandlers: Array<() => void> = []
    selection = ''
    disposed = false
    fontFamily = ''
    fontSize = 0
    lineHeight = 0
    constructor(options: { fontFamily?: string; fontSize?: number; lineHeight?: number } = {}) {
      this.fontFamily = options.fontFamily ?? ''
      this.fontSize = options.fontSize ?? 0
      this.lineHeight = options.lineHeight ?? 0
    }
    loadAddon(): void {}
    open(): void { xtermState.instances.push(this as never) }
    write(data: string): void { this.writes.push(data) }
    onData(handler: (data: string) => void): { dispose: () => void } {
      this.dataHandlers.push(handler)
      return { dispose: () => {} }
    }
    getSelection(): string { return this.selection }
    hasSelection(): boolean { return this.selection.length > 0 }
    clearSelection(): void { this.selection = '' }
    onSelectionChange(handler: () => void): { dispose: () => void } {
      this.selectionHandlers.push(handler)
      return { dispose: () => {} }
    }
    linkProvider: { provideLinks: (_y: number, cb: (links: unknown) => void) => void } | undefined
    buffer = {
      active: {
        getLine: (index: number) => {
          if (index === 0) return { translateToString: () => 'see http://127.0.0.1:5173 and src/app.ts' }
          if (index === 1) return { translateToString: () => 'hello' }
          return undefined
        },
      },
    }
    registerLinkProvider(provider: { provideLinks: (y: number, cb: (links: unknown) => void) => void }): { dispose: () => void } {
      this.linkProvider = provider
      return { dispose: () => { this.linkProvider = undefined } }
    }
    dispose(): void { this.disposed = true }
  }
  return { Terminal: FakeTerminal }
})

vi.mock('@xterm/addon-fit', () => ({
  FitAddon: class { fit(): void {} },
}))

import type { SessionId, SessionListState } from '@deepseek-ai/dsh-client-runtime/client'
import type { TerminalDrawerProps } from '../src/client/TerminalDrawer.tsx'
import { TerminalDrawer } from '../src/client/TerminalDrawer.tsx'
import type { TerminalSurfaceProps } from '../src/client/TerminalSurface.tsx'
import { TerminalSurface } from '../src/client/TerminalSurface.tsx'
import { createTerminalSessionStore, MAX_TERMINALS_PER_GROUP } from '../src/client/stores.ts'
import { clampDrawerHeight, maxDrawerHeight, TERMINAL_DRAWER_MIN } from '../src/client/height.ts'
import { en, zh } from '../src/client/locales.ts'
import { bindPtyListeners } from '../src/client/pty-bridge.ts'

const SID = 'session-term' as SessionId
const t: TerminalDrawerProps['t'] = key => (en as Record<string, string>)[key] ?? key
const neverHook = (() => { throw new Error('terminal drawer must not read this hook') }) as never

function sessionList(cwd: string | undefined): SessionListState {
  const current = cwd === undefined ? undefined : SID
  const byId = current === undefined
    ? {}
    : {
        [SID]: {
          id: SID,
          displayTitle: 'proj',
          running: false,
          blank: false,
          updatedAt: 1,
          ...(cwd ? { cwd } : {}),
        },
      }
  return {
    ids: current === undefined ? [] : [SID],
    byId,
    current,
    phase: 'ready',
    subagentsByParent: {},
    jobsBySession: {},
    currentAddress: undefined,
  }
}

function bindStore(instance: ReturnType<ReturnType<typeof createTerminalSessionStore>['create']>) {
  return {
    useStore: <S,>(sel: (state: ReturnType<typeof instance.getSnapshot>) => S) => {
      const snap = useSyncExternalStore(instance.subscribe, instance.getSnapshot, instance.getSnapshot)
      return sel(snap)
    },
    actions: instance.actions,
  }
}

function mount(opts: {
  cwd?: string | undefined
  sessionId?: SessionId | undefined | null
  handle?: ReturnType<typeof createTerminalSessionStore>
  instance?: ReturnType<ReturnType<typeof createTerminalSessionStore>['create']>
  surface?: boolean
  surfaceHandle?: ReturnType<typeof createTerminalSessionStore>
  surfaceInstance?: ReturnType<ReturnType<typeof createTerminalSessionStore>['create']>
  ptyCreate?: (input: { cwd: string }) => Promise<{ id: string }>
  t?: TerminalDrawerProps['t']
} = {}) {
  const handle = opts.handle ?? createTerminalSessionStore()
  const instance = opts.instance ?? handle.create('session-1')
  const surfaceHandle = opts.surfaceHandle ?? (opts.surface ? createTerminalSessionStore() : handle)
  const surfaceInstance = opts.surfaceInstance ?? (opts.surface ? surfaceHandle.create('session-1') : instance)
  let seq = 0
  const ptyCreate = opts.ptyCreate ?? vi.fn(async (_input: { cwd: string }) => ({ id: `pty-${++seq}` }))
  const ptyWrite = vi.fn(async () => {})
  const ptyResize = vi.fn(async () => {})
  const ptyKill = vi.fn(async () => {})
  const dataHandlers: Array<(payload: { id: string; data: string }) => void> = []
  const exitHandlers: Array<(payload: { id: string; code: number }) => void> = []
  const onPtyData = vi.fn((handler: (payload: { id: string; data: string }) => void) => {
    dataHandlers.push(handler)
    return () => {}
  })
  const onPtyExit = vi.fn((handler: (payload: { id: string; code: number }) => void) => {
    exitHandlers.push(handler)
    return () => {}
  })
  const toggleTerminalDrawer = vi.fn()
  const setTerminalDrawer = vi.fn()
  const mentionTerminal = vi.fn()
  const writeClipboard = vi.fn(async () => {})
  const openWorkspacePath = vi.fn()
  const openLocalUrl = vi.fn()
  const openExternal = vi.fn()
  const store = bindStore(instance)
  const surfaceStore = opts.surface ? bindStore(surfaceInstance) : store
  const shared = {
    sessionId: opts.sessionId === null
      ? undefined
      : (opts.sessionId === undefined && opts.cwd === undefined ? undefined : (opts.sessionId ?? SID)),
    useSession: neverHook,
    useSessions: ((sel: (s: SessionListState) => unknown) => sel(sessionList(opts.cwd))) as TerminalDrawerProps['useSessions'],
    useWorkspaces: neverHook,
    useProjection: neverHook,
    useInput: neverHook,
    inputActions: undefined,
    ...store,
    ptyCreate,
    ptyWrite,
    ptyResize,
    ptyKill,
    onPtyData,
    onPtyExit,
    toggleTerminalDrawer,
    setTerminalDrawer,
    mentionTerminal,
    writeClipboard,
    openWorkspacePath,
    openLocalUrl,
    openExternal,
    t: opts.t ?? t,
  }
  const view = render(
    <>
      <TerminalDrawer {...shared} />
      {opts.surface
        ? <TerminalSurface {...(shared as unknown as TerminalSurfaceProps)} {...surfaceStore} />
        : null}
    </>,
  )
  return {
    ptyCreate, ptyWrite, ptyKill, toggleTerminalDrawer, setTerminalDrawer,
    mentionTerminal, writeClipboard, openWorkspacePath, openLocalUrl, openExternal,
    instance, handle,
    surfaceHandle, surfaceInstance,
    onPtyData, onPtyExit, dataHandlers, exitHandlers,
    rerender: view.rerender, shared,
  }
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  xtermState.instances.length = 0
})

describe('clampDrawerHeight', () => {
  it('floors at TERMINAL_DRAWER_MIN and caps at 75% of the viewport', () => {
    expect(clampDrawerHeight(1, 800)).toBe(TERMINAL_DRAWER_MIN)
    expect(clampDrawerHeight(900, 800)).toBe(maxDrawerHeight(800))
    expect(maxDrawerHeight(800)).toBe(600)
  })
})

describe('TerminalDrawer', () => {
  it('does not create a PTY when the session has no cwd', () => {
    const b = mount({ cwd: undefined, sessionId: undefined })
    expect(screen.getByText('A workspace is required to start a terminal')).toBeTruthy()
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'New terminal' }).disabled).toBe(true)
    expect(b.ptyCreate).not.toHaveBeenCalled()
  })

  it('creates a PTY on New and closes it from the toolbar', async () => {
    const b = mount({ cwd: '/work' })
    fireEvent.click(screen.getByRole('button', { name: 'New terminal' }))
    await waitFor(() => expect(b.ptyCreate).toHaveBeenCalledWith({ cwd: '/work' }))
    expect(await screen.findByRole('log', { name: 'pty-1' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Close terminal' }))
    await waitFor(() => expect(b.ptyKill).toHaveBeenCalledWith('pty-1'))
    expect(screen.queryByRole('log', { name: 'pty-1' })).toBeNull()
  })

  it('splits up to MAX_TERMINALS_PER_GROUP and then disables split', async () => {
    mount({ cwd: '/work' })
    fireEvent.click(screen.getByRole('button', { name: 'New terminal' }))
    await screen.findByRole('log', { name: 'pty-1' })
    for (let index = 2; index <= MAX_TERMINALS_PER_GROUP; index += 1) {
      fireEvent.click(screen.getByRole('button', { name: 'Split left/right' }))
      await screen.findByRole('log', { name: `pty-${index}` })
    }
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Split left/right (max 4 per group)' }).disabled).toBe(true)
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Split top/bottom (max 4 per group)' }).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Split left/right (max 4 per group)' }))
    fireEvent.click(screen.getByRole('button', { name: 'Split top/bottom (max 4 per group)' }))
    expect(screen.queryByRole('log', { name: 'pty-5' })).toBeNull()
  })

  it('keeps drawer and surface session tables independent', async () => {
    const handle = createTerminalSessionStore()
    const instance = handle.create('session-1')
    const surfaceHandle = createTerminalSessionStore()
    const surfaceInstance = surfaceHandle.create('session-1')
    mount({ cwd: '/work', handle, instance, surface: true, surfaceHandle, surfaceInstance })
    fireEvent.click(screen.getAllByRole('button', { name: 'New terminal' })[0]!)
    await screen.findByRole('log', { name: 'pty-1' })
    expect(instance.getSnapshot().sessions.map(session => session.id)).toEqual(['pty-1'])
    expect(surfaceInstance.getSnapshot().sessions).toHaveLength(0)
    expect(screen.queryAllByRole('log', { name: 'pty-1' })).toHaveLength(1)
  })

  it('writes a clamped height through setTerminalDrawer on drag', () => {
    const b = mount({ cwd: '/work' })
    const handle = screen.getByRole('separator', { name: 'Resize terminal drawer' })
    handle.getBoundingClientRect = () => ({
      x: 0, y: 400, width: 800, height: 6, top: 400, left: 0, bottom: 406, right: 800, toJSON() { return {} },
    })
    fireEvent.pointerDown(handle, { button: 0, clientY: 400, pointerId: 1 })
    fireEvent.pointerMove(handle, { clientY: 100, pointerId: 1 })
    fireEvent.pointerUp(handle, { pointerId: 1 })
    expect(b.setTerminalDrawer).toHaveBeenCalled()
    const next = b.setTerminalDrawer.mock.calls.at(-1)?.[0] as number
    expect(next).toBeGreaterThanOrEqual(TERMINAL_DRAWER_MIN)
    expect(next).toBeLessThanOrEqual(maxDrawerHeight(window.innerHeight))
  })

  it('maximize writes 75% of the viewport and restore writes the previous height', () => {
    const b = mount({ cwd: '/work' })
    const root = document.querySelector('[data-terminal-owner="drawer"]') as HTMLElement
    Object.defineProperty(root, 'clientHeight', { configurable: true, value: 280 })
    fireEvent.click(screen.getByRole('button', { name: 'Maximize' }))
    expect(b.setTerminalDrawer).toHaveBeenCalledWith(maxDrawerHeight(window.innerHeight))
    fireEvent.click(screen.getByRole('button', { name: 'Restore' }))
    expect(b.setTerminalDrawer).toHaveBeenLastCalledWith(280)
  })

  it('omits maximize on the surfaces.terminal occupant', async () => {
    mount({ cwd: '/work', surface: true })
    fireEvent.click(screen.getAllByRole('button', { name: 'New terminal' })[0]!)
    await screen.findAllByRole('log')
    const surface = document.querySelector('[data-terminal-owner="surface"]') as HTMLElement
    expect(surface).toBeTruthy()
    expect(surface.querySelector('[aria-label="Maximize"]')).toBeNull()
    expect(screen.getByRole('button', { name: 'Maximize' })).toBeTruthy()
  })

  it('copies a selection, appends it to chat, and opens a URL from the selection bar', async () => {
    const b = mount({ cwd: '/work' })
    fireEvent.click(screen.getByRole('button', { name: 'New terminal' }))
    await screen.findByRole('log', { name: 'pty-1' })
    const term = xtermState.instances.at(-1)!
    term.selection = 'http://127.0.0.1:5173\n'
    for (const handler of term.selectionHandlers) handler()
    fireEvent.click(await screen.findByRole('button', { name: 'Copy' }))
    expect(b.writeClipboard).toHaveBeenCalledWith('http://127.0.0.1:5173')
    fireEvent.click(screen.getByRole('button', { name: 'Open link' }))
    expect(b.openLocalUrl).toHaveBeenCalledWith('http://127.0.0.1:5173')
    fireEvent.click(screen.getByRole('button', { name: 'Add to chat' }))
    expect(b.mentionTerminal).toHaveBeenCalledWith(SID, 'http://127.0.0.1:5173')
  })

  it('opens a non-loopback URL from the selection bar in the system browser', async () => {
    const b = mount({ cwd: '/work' })
    fireEvent.click(screen.getByRole('button', { name: 'New terminal' }))
    await screen.findByRole('log', { name: 'pty-1' })
    const term = xtermState.instances.at(-1)!
    term.selection = 'https://example.com/docs\n'
    for (const handler of term.selectionHandlers) handler()
    fireEvent.click(await screen.findByRole('button', { name: 'Open link' }))
    expect(b.openExternal).toHaveBeenCalledWith('https://example.com/docs')
    expect(b.openLocalUrl).not.toHaveBeenCalled()
  })

  it('disables Add to chat when the session id is missing', async () => {
    const b = mount({ cwd: '/work', sessionId: null })
    fireEvent.click(screen.getByRole('button', { name: 'New terminal' }))
    await screen.findByRole('log', { name: 'pty-1' })
    const term = xtermState.instances.at(-1)!
    term.selection = 'ls\n'
    for (const handler of term.selectionHandlers) handler()
    const add = await screen.findByRole('button', { name: 'Add to chat' })
    expect((add as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(add)
    expect(b.mentionTerminal).not.toHaveBeenCalled()
  })

  it('activates a Ctrl-clicked terminal URL through the link provider', async () => {
    const b = mount({ cwd: '/work' })
    fireEvent.click(screen.getByRole('button', { name: 'New terminal' }))
    await screen.findByRole('log', { name: 'pty-1' })
    const term = xtermState.instances.at(-1)!
    let links: Array<{ activate: (event: MouseEvent, text: string) => void; text: string }> | undefined
    term.linkProvider?.provideLinks(1, (next) => { links = next as typeof links })
    expect(links?.length).toBeGreaterThan(0)
    Object.defineProperty(navigator, 'platform', { configurable: true, value: 'Win32' })
    links![0]!.activate({ ctrlKey: true, metaKey: false } as MouseEvent, links![0]!.text)
    expect(b.openLocalUrl).toHaveBeenCalled()
    links![0]!.activate({ ctrlKey: false, metaKey: false } as MouseEvent, links![0]!.text)
    term.linkProvider?.provideLinks(2, (next) => { expect(next).toBeUndefined() })
    term.linkProvider?.provideLinks(99, (next) => { expect(next).toBeUndefined() })
  })

  it('does not register its own Ctrl+` listener; the titlebar toggle owns the shortcut', () => {
    const withCwd = mount({ cwd: '/work' })
    fireEvent.keyDown(window, { key: '`', ctrlKey: true })
    expect(withCwd.toggleTerminalDrawer).not.toHaveBeenCalled()
    cleanup()
    const without = mount({ cwd: undefined, sessionId: undefined })
    fireEvent.keyDown(window, { key: '`', ctrlKey: true })
    expect(without.toggleTerminalDrawer).not.toHaveBeenCalled()
  })

  it('fans one PTY subscription to both stores and only the owner records data', async () => {
    const handle = createTerminalSessionStore()
    const instance = handle.create('session-1')
    const surfaceHandle = createTerminalSessionStore()
    const surfaceInstance = surfaceHandle.create('session-1')
    const b = mount({ cwd: '/work', handle, instance, surface: true, surfaceHandle, surfaceInstance })
    bindPtyListeners([handle, surfaceHandle], { onPtyData: b.onPtyData, onPtyExit: b.onPtyExit })
    fireEvent.click(screen.getAllByRole('button', { name: 'New terminal' })[0]!)
    await screen.findByRole('log', { name: 'pty-1' })
    expect(b.onPtyData).toHaveBeenCalledTimes(1)
    for (const handler of b.dataHandlers) handler({ id: 'pty-1', data: 'hello' })
    expect(instance.getSnapshot().sessions[0]?.buffer).toBe('hello')
    expect(surfaceInstance.getSnapshot().sessions).toHaveLength(0)
    await waitFor(() => {
      expect(xtermState.instances.every(term => term.writes.join('') === 'hello')).toBe(true)
    })
  })

  it('lets each empty shell auto-create its own PTY', async () => {
    const observers: Array<() => void> = []
    vi.stubGlobal('ResizeObserver', class {
      cb: ResizeObserverCallback
      constructor(cb: ResizeObserverCallback) { this.cb = cb }
      observe(el: Element) {
        Object.defineProperty(el, 'clientHeight', { configurable: true, value: 200 })
        Object.defineProperty(el, 'clientWidth', { configurable: true, value: 800 })
        const run = () => { this.cb([] as never, this as never) }
        observers.push(run)
        run()
      }
      disconnect() {}
      unobserve() {}
    })
    const b = mount({ cwd: '/work', surface: true })
    await waitFor(() => expect(b.ptyCreate).toHaveBeenCalledTimes(2))
    for (const run of observers) run()
    await Promise.resolve()
    expect(b.ptyCreate).toHaveBeenCalledTimes(2)
    expect(b.instance.getSnapshot().sessions).toHaveLength(1)
    expect(b.surfaceInstance.getSnapshot().sessions).toHaveLength(1)
  })

  it('closes the session when onPtyExit fires', async () => {
    const handle = createTerminalSessionStore()
    const instance = handle.create('session-1')
    const b = mount({ cwd: '/work', handle, instance })
    bindPtyListeners([handle], { onPtyData: b.onPtyData, onPtyExit: b.onPtyExit })
    fireEvent.click(screen.getAllByRole('button', { name: 'New terminal' })[0]!)
    await screen.findAllByRole('log', { name: 'pty-1' })
    for (const handler of b.exitHandlers) handler({ id: 'pty-1', code: 0 })
    await waitFor(() => expect(instance.getSnapshot().sessions).toHaveLength(0))
    expect(screen.queryByRole('log', { name: 'pty-1' })).toBeNull()
  })

  it('forwards xterm input to the PTY and does not nest a button around the pane', async () => {
    const b = mount({ cwd: '/work' })
    fireEvent.click(screen.getByRole('button', { name: 'New terminal' }))
    const log = await screen.findByRole('log', { name: 'pty-1' })
    expect(log.closest('button')).toBeNull()
    const term = xtermState.instances.at(-1)!
    for (const handler of term.dataHandlers) handler('ls\r')
    expect(b.ptyWrite).toHaveBeenCalledWith('pty-1', 'ls\r')
  })

  it('does not auto-create after the last pane is closed', async () => {
    const observers: Array<() => void> = []
    vi.stubGlobal('ResizeObserver', class {
      cb: ResizeObserverCallback
      constructor(cb: ResizeObserverCallback) { this.cb = cb }
      observe(el: Element) {
        Object.defineProperty(el, 'clientHeight', { configurable: true, value: 200 })
        Object.defineProperty(el, 'clientWidth', { configurable: true, value: 800 })
        const run = () => { this.cb([] as never, this as never) }
        observers.push(run)
        run()
      }
      disconnect() {}
      unobserve() {}
    })
    const b = mount({ cwd: '/work' })
    await waitFor(() => expect(b.ptyCreate).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getByRole('button', { name: 'Close terminal' }))
    await waitFor(() => expect(b.ptyKill).toHaveBeenCalledWith('pty-1'))
    expect(screen.queryByRole('log', { name: 'pty-1' })).toBeNull()
    for (const run of observers) run()
    await Promise.resolve()
    expect(b.ptyCreate).toHaveBeenCalledTimes(1)
    expect(b.instance.getSnapshot().sessions).toHaveLength(0)
  })

  it('constructs xterm with a resolved monospace family and 1.2 line height', async () => {
    mount({ cwd: '/work' })
    expect(screen.getByRole('button', { name: 'Split left/right' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Split top/bottom' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'New terminal' }))
    await screen.findByRole('log', { name: 'pty-1' })
    const term = xtermState.instances.at(-1)!
    expect(term.fontFamily.includes('var(')).toBe(false)
    expect(term.fontFamily.length).toBeGreaterThan(0)
    expect(term.lineHeight).toBe(1.2)
  })

  it('shows a session list after a second PTY and can activate or close a row', async () => {
    const b = mount({ cwd: '/work' })
    fireEvent.click(screen.getByRole('button', { name: 'New terminal' }))
    await screen.findByRole('log', { name: 'pty-1' })
    fireEvent.click(screen.getByRole('button', { name: 'New terminal' }))
    await waitFor(() => expect(b.instance.getSnapshot().sessions).toHaveLength(2))
    const list = screen.getByRole('list', { name: 'Terminal sessions' })
    expect(list).toBeTruthy()
    expect(screen.getByRole('button', { name: /^Group 2$/ })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /^Group 2$/ }))
    expect(b.instance.getSnapshot().activeId).toBe('pty-2')
    fireEvent.click(screen.getByRole('button', { name: /^Group 1$/ }))
    expect(b.instance.getSnapshot().activeId).toBe('pty-1')
    fireEvent.click(screen.getByRole('button', { name: /^Terminal 2$/ }))
    expect(b.instance.getSnapshot().activeId).toBe('pty-2')
    fireEvent.click(screen.getByRole('button', { name: /^Terminal 1$/ }))
    expect(b.instance.getSnapshot().activeId).toBe('pty-1')
    fireEvent.click(screen.getByRole('button', { name: /^Close terminal Terminal 2$/ }))
    await waitFor(() => expect(b.ptyKill).toHaveBeenCalledWith('pty-2'))
    expect(b.instance.getSnapshot().sessions.map(session => session.id)).toEqual(['pty-1'])
    expect(screen.queryByRole('list', { name: 'Terminal sessions' })).toBeNull()
  })

  it('tiles a vertical split as stacked panes', async () => {
    mount({ cwd: '/work' })
    fireEvent.click(screen.getByRole('button', { name: 'New terminal' }))
    await screen.findByRole('log', { name: 'pty-1' })
    fireEvent.click(screen.getByRole('button', { name: 'Split top/bottom' }))
    await screen.findByRole('log', { name: 'pty-2' })
    const panes = document.querySelector('[data-split-direction="vertical"]')
    expect(panes).toBeTruthy()
    expect((panes as HTMLElement).style.gridTemplateRows).toContain('minmax(0, 1fr)')
  })

  it('does not resize the PTY from workspace width/8 math', async () => {
    vi.stubGlobal('ResizeObserver', class {
      cb: ResizeObserverCallback
      constructor(cb: ResizeObserverCallback) { this.cb = cb }
      observe(el: Element) {
        Object.defineProperty(el, 'clientHeight', { configurable: true, value: 200 })
        Object.defineProperty(el, 'clientWidth', { configurable: true, value: 800 })
        this.cb([] as never, this as never)
      }
      disconnect() {}
      unobserve() {}
    })
    const b = mount({ cwd: '/work' })
    await waitFor(() => expect(b.ptyCreate).toHaveBeenCalledTimes(1))
    await screen.findByRole('log', { name: 'pty-1' })
    expect(b.instance.getSnapshot().sessions[0]?.cols).toBe(80)
    expect(b.instance.getSnapshot().sessions[0]?.rows).toBe(24)
  })

  it('shows Chinese copy on ptyCreate rejection and does not auto-retry', async () => {
    const observers: Array<() => void> = []
    vi.stubGlobal('ResizeObserver', class {
      cb: ResizeObserverCallback
      constructor(cb: ResizeObserverCallback) { this.cb = cb }
      observe(el: Element) {
        Object.defineProperty(el, 'clientHeight', { configurable: true, value: 200 })
        Object.defineProperty(el, 'clientWidth', { configurable: true, value: 800 })
        const run = () => { this.cb([] as never, this as never) }
        observers.push(run)
        run()
      }
      disconnect() {}
      unobserve() {}
    })
    const ptyCreate = vi.fn(async () => { throw new Error('node-pty is not available') })
    mount({
      cwd: '/work',
      ptyCreate,
      t: key => (zh as Record<string, string>)[key] ?? key,
    })
    await waitFor(() => expect(screen.getByText('无法启动终端')).toBeTruthy())
    expect(ptyCreate).toHaveBeenCalledTimes(1)
    for (const run of observers) run()
    await Promise.resolve()
    expect(ptyCreate).toHaveBeenCalledTimes(1)
  })
})

describe('ui-user-terminal production imports', () => {
  it('does not import another plugin src/client from production code', () => {
    const dir = join(process.cwd(), 'packages/client/ui-user-terminal/src/client')
    for (const name of readdirSync(dir)) {
      if (!/\.(ts|tsx)$/.test(name)) continue
      const text = readFileSync(join(dir, name), 'utf8')
      expect(text.includes('@deepseek-ai/dsh-client-ui-layout/src/'), name).toBe(false)
    }
  })
})
