// @vitest-environment jsdom
import { useSyncExternalStore } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { SessionId, SessionListState } from '@deepseek-ai/dsh-client-runtime/client'
import { TERMINAL_DRAWER_MIN } from '@deepseek-ai/dsh-client-ui-layout/src/client/columns.ts'
import type { TerminalDrawerProps } from '../src/client/TerminalDrawer.tsx'
import { TerminalDrawer } from '../src/client/TerminalDrawer.tsx'
import { TerminalSurface } from '../src/client/TerminalSurface.tsx'
import { createTerminalSessionStore, MAX_TERMINALS_PER_GROUP } from '../src/client/stores.ts'
import { clampDrawerHeight, maxDrawerHeight } from '../src/client/height.ts'
import { en } from '../src/client/locales.ts'

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
          ...(cwd === '' ? {} : { cwd }),
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
  sessionId?: SessionId | undefined
  instance?: ReturnType<ReturnType<typeof createTerminalSessionStore>['create']>
  surface?: boolean
} = {}) {
  const instance = opts.instance ?? createTerminalSessionStore().create('session-1')
  let seq = 0
  const ptyCreate = vi.fn(async () => ({ id: `pty-${++seq}` }))
  const ptyWrite = vi.fn(async () => {})
  const ptyResize = vi.fn(async () => {})
  const ptyKill = vi.fn(async () => {})
  const onPtyData = vi.fn(() => () => {})
  const onPtyExit = vi.fn(() => () => {})
  const toggleTerminalDrawer = vi.fn()
  const setTerminalDrawer = vi.fn()
  const store = bindStore(instance)
  const shared = {
    sessionId: opts.sessionId === undefined && opts.cwd === undefined ? undefined : (opts.sessionId ?? SID),
    useSession: neverHook,
    useSessions: ((sel: (s: SessionListState) => unknown) => sel(sessionList(opts.cwd))) as TerminalDrawerProps['useSessions'],
    useWorkspaces: neverHook,
    useProjection: neverHook,
    ...store,
    ptyCreate,
    ptyWrite,
    ptyResize,
    ptyKill,
    onPtyData,
    onPtyExit,
    toggleTerminalDrawer,
    setTerminalDrawer,
    t,
  }
  const view = render(
    <>
      <TerminalDrawer {...shared} />
      {opts.surface ? <TerminalSurface {...shared} /> : null}
    </>,
  )
  return { ptyCreate, ptyKill, toggleTerminalDrawer, setTerminalDrawer, instance, rerender: view.rerender, shared }
}

afterEach(cleanup)

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
      fireEvent.click(screen.getByRole('button', { name: 'Split' }))
      await screen.findByRole('log', { name: `pty-${index}` })
    }
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Split (max 4 per group)' }).disabled).toBe(true)
  })

  it('lets the drawer and surface activate the same terminal id', async () => {
    const instance = createTerminalSessionStore().create('session-1')
    mount({ cwd: '/work', instance, surface: true })
    fireEvent.click(screen.getAllByRole('button', { name: 'New terminal' })[0]!)
    await screen.findAllByRole('log', { name: 'pty-1' })
    fireEvent.click(screen.getAllByRole('button', { name: 'Split' })[0]!)
    await waitFor(() => expect(screen.getAllByRole('log', { name: 'pty-2' }).length).toBeGreaterThan(0))
    const drawerPane = screen.getAllByRole('button', { name: 'Terminal pty-1' })[0]!
    fireEvent.click(drawerPane)
    expect(instance.store.getSnapshot().activeId).toBe('pty-1')
    expect(screen.getAllByRole('log', { name: 'pty-1' }).length).toBe(2)
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

  it('maximize writes 75% of the viewport', () => {
    const b = mount({ cwd: '/work' })
    fireEvent.click(screen.getByRole('button', { name: 'Maximize' }))
    expect(b.setTerminalDrawer).toHaveBeenCalledWith(maxDrawerHeight(window.innerHeight))
  })

  it('Ctrl+` toggles the drawer when a cwd exists and no-ops without one', () => {
    const withCwd = mount({ cwd: '/work' })
    fireEvent.keyDown(window, { key: '`', ctrlKey: true })
    expect(withCwd.toggleTerminalDrawer).toHaveBeenCalledOnce()
    cleanup()
    const without = mount({ cwd: undefined, sessionId: undefined })
    fireEvent.keyDown(window, { key: '`', ctrlKey: true })
    expect(without.toggleTerminalDrawer).not.toHaveBeenCalled()
  })
})
