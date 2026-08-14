// @vitest-environment jsdom
import { useSyncExternalStore } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { SessionId, SessionListState } from '@deepseek-ai/dsh-client-runtime/client'
import { en } from '../src/client/locales.ts'
import { createSurfacesStore } from '../src/client/stores.ts'
import type { SurfacesRootProps } from '../src/client/SurfacesRoot.tsx'
import { SurfacesRoot } from '../src/client/SurfacesRoot.tsx'

const t: SurfacesRootProps['t'] = key => (en as Record<string, string>)[key] ?? key
const neverHook = (() => { throw new Error('surfaces must not read this hook') }) as never

function sessions(cwd?: string): SurfacesRootProps['useSessions'] {
  const current = 'session-1' as SessionId
  const state = {
    current,
    ids: [current],
    byId: cwd === undefined
      ? {}
      : {
          [current]: {
            id: current,
            displayTitle: 'proj',
            running: false,
            blank: false,
            updatedAt: 1,
            cwd,
          },
        },
    phase: 'ready',
    subagentsByParent: {},
    jobsBySession: {},
    currentAddress: undefined,
  } as SessionListState
  return sel => sel(state)
}

function bindStore(instance: ReturnType<ReturnType<typeof createSurfacesStore>['create']>) {
  return {
    useStore: <S,>(sel: (state: ReturnType<typeof instance.getSnapshot>) => S) => {
      const snap = useSyncExternalStore(instance.subscribe, instance.getSnapshot, instance.getSnapshot)
      return sel(snap)
    },
    actions: instance.actions,
  }
}

function mount(opts: {
  store?: ReturnType<ReturnType<typeof createSurfacesStore>['create']>
  cwd?: string
  gitStatus?: SurfacesRootProps['gitStatus']
} = {}) {
  const instance = opts.store ?? createSurfacesStore().create()
  const openSurfaces = vi.fn()
  const renderSlot = vi.fn(() => <div data-occupant="stub" />)
  const gitStatus = opts.gitStatus ?? vi.fn(async () => null)
  render(
    <SurfacesRoot
      sessionId={'session-1' as SessionId}
      useSession={neverHook}
      useSessions={sessions(opts.cwd)}
      useWorkspaces={neverHook}
      useProjection={neverHook}
      {...bindStore(instance)}
      renderSlot={renderSlot}
      openSurfaces={openSurfaces}
      previewAvailable
      gitStatus={gitStatus}
      t={t}
    />,
  )
  return { instance, openSurfaces, renderSlot, gitStatus }
}

afterEach(cleanup)

describe('SurfacesRoot', () => {
  it('shows empty cards when the session has no surfaces', () => {
    mount()
    expect(screen.getByText('Open a surface')).toBeTruthy()
    expect(screen.getByRole('button', { name: /Files/ })).toBeTruthy()
    expect(screen.queryByText('Close Files')).toBeNull()
  })

  it('opens files and the column when the Files card is clicked', () => {
    const b = mount()
    fireEvent.click(screen.getByRole('button', { name: /Files/ }))
    expect(b.openSurfaces).toHaveBeenCalledOnce()
    expect(b.instance.getSnapshot().bySession['session-1']?.surfaces).toEqual([
      { id: 'files', kind: 'files' },
    ])
    expect(screen.getByRole('button', { name: 'Close Files' })).toBeTruthy()
    expect(b.renderSlot).toHaveBeenCalledWith('surfaces.files', expect.objectContaining({
      openFile: expect.any(Function),
    }))
  })

  it('openFile from the files occupant opens a file: surface', async () => {
    const b = mount()
    fireEvent.click(screen.getByRole('button', { name: /Files/ }))
    const owner = b.renderSlot.mock.calls.find(call => call[0] === 'surfaces.files')?.[1] as {
      openFile: (relativePath: string) => void
    }
    act(() => { owner.openFile('src/app.ts') })
    expect(b.instance.getSnapshot().bySession['session-1']?.surfaces).toEqual([
      { id: 'file:src/app.ts', kind: 'file', relativePath: 'src/app.ts' },
    ])
    await waitFor(() => {
      expect(b.renderSlot).toHaveBeenCalledWith('surfaces.file', { relativePath: 'src/app.ts' })
    })
  })

  it('keeps the open surface when the column is opened again (titlebar toggle does not clear the store)', () => {
    const instance = createSurfacesStore().create()
    instance.actions.open('session-1', 'files')
    const b = mount({ store: instance })
    expect(screen.getByRole('button', { name: 'Close Files' })).toBeTruthy()
    expect(screen.queryByText('Open a surface')).toBeNull()
    expect(b.renderSlot).toHaveBeenCalledWith('surfaces.files', expect.objectContaining({
      openFile: expect.any(Function),
    }))

    b.openSurfaces()
    expect(instance.getSnapshot().bySession['session-1']?.surfaces).toEqual([
      { id: 'files', kind: 'files' },
    ])
  })

  it('closing the last tab returns to the empty cards', () => {
    const instance = createSurfacesStore().create()
    instance.actions.open('session-1', 'files')
    mount({ store: instance })
    fireEvent.click(screen.getByRole('button', { name: 'Close Files' }))
    expect(instance.getSnapshot()).toEqual({ bySession: {} })
    expect(screen.getByText('Open a surface')).toBeTruthy()
  })

  it('disables Browser when preview IPC is absent', () => {
    const instance = createSurfacesStore().create()
    const openSurfaces = vi.fn()
    render(
      <SurfacesRoot
        sessionId={'session-1' as SessionId}
        useSession={neverHook}
        useSessions={sessions('/tmp/proj')}
        useWorkspaces={neverHook}
        useProjection={neverHook}
        {...bindStore(instance)}
        renderSlot={vi.fn(() => null)}
        openSurfaces={openSurfaces}
        previewAvailable={false}
        gitStatus={vi.fn(async () => null)}
        t={t}
      />,
    )
    const browser = screen.getByRole('button', { name: /Browser/ })
    expect(browser).toHaveProperty('disabled', true)
    fireEvent.click(browser)
    expect(openSurfaces).not.toHaveBeenCalled()
    expect(browser.getAttribute('title')).toBe('Browser previews are only available in the desktop app.')
  })

  it('disables Diff when gitStatus is null and enables it for a repository', async () => {
    const missing = mount({ cwd: '/tmp/plain' })
    await waitFor(() => {
      expect(missing.gitStatus).toHaveBeenCalledWith('/tmp/plain')
    })
    expect(screen.getByRole('button', { name: /Diff/ })).toHaveProperty('disabled', true)

    cleanup()
    const present = mount({
      cwd: '/tmp/repo',
      gitStatus: vi.fn(async () => ({ refName: 'main' })),
    })
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Diff/ })).toHaveProperty('disabled', false)
    })
    fireEvent.click(screen.getByRole('button', { name: /Diff/ }))
    expect(present.instance.getSnapshot().bySession['session-1']?.surfaces).toEqual([
      { id: 'diff', kind: 'diff' },
    ])
  })
})
