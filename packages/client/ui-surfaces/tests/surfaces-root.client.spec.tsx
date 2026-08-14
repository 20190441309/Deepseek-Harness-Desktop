// @vitest-environment jsdom
import { useSyncExternalStore } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { SessionId, SessionListState } from '@deepseek-ai/dsh-client-runtime/client'
import { en } from '../src/client/locales.ts'
import { createSurfacesStore } from '../src/client/stores.ts'
import type { SurfacesRootProps } from '../src/client/SurfacesRoot.tsx'
import { SurfacesRoot } from '../src/client/SurfacesRoot.tsx'

const t: SurfacesRootProps['t'] = key => (en as Record<string, string>)[key] ?? key
const neverHook = (() => { throw new Error('surfaces must not read this hook') }) as never

function sessions(): SurfacesRootProps['useSessions'] {
  const state = { current: 'session-1', byId: {} } as SessionListState
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
} = {}) {
  const instance = opts.store ?? createSurfacesStore().create()
  const openSurfaces = vi.fn()
  const renderSlot = vi.fn(() => <div data-occupant="stub" />)
  render(
    <SurfacesRoot
      sessionId={'session-1' as SessionId}
      useSession={neverHook}
      useSessions={sessions()}
      useWorkspaces={neverHook}
      useProjection={neverHook}
      {...bindStore(instance)}
      renderSlot={renderSlot}
      openSurfaces={openSurfaces}
      t={t}
    />,
  )
  return { instance, openSurfaces, renderSlot }
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
    expect(b.renderSlot).toHaveBeenCalledWith('surfaces.files', {})
  })

  it('keeps the open surface when the column is opened again (titlebar toggle does not clear the store)', () => {
    const instance = createSurfacesStore().create()
    instance.actions.open('session-1', 'files')
    const b = mount({ store: instance })
    expect(screen.getByRole('button', { name: 'Close Files' })).toBeTruthy()
    expect(screen.queryByText('Open a surface')).toBeNull()
    expect(b.renderSlot).toHaveBeenCalledWith('surfaces.files', {})

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
})
