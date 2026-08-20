// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type {
  SidebarFooterActionOwnerProps, SidebarPageOwnerProps, SidebarRootComponentProps,
  SidebarSectionOwnerProps, SidebarSettingsOwnerProps,
} from '../src/client/contract/slots.ts'
import type { SidebarNavTabRow } from '../src/client/stores.ts'
import { SESSIONS_TAB_ID } from '../src/client/stores.ts'
import { SidebarRoot } from '../src/client/SidebarRoot.tsx'
import { en } from '../src/client/locales.ts'

// English-dictionary translate stub: the shell renders the same copy the
// assertions below query by accessible name.
const t: SidebarRootComponentProps['t'] = key => (en as Record<string, string>)[key] ?? key

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

// The shell never reads the global hooks itself, but they ride the standard
// props share; stub them as never-called functions.
const neverHook = (() => { throw new Error('shell must not read global hooks') }) as never

function mountShell({
  collapsed = false,
  width = 300,
  tabs = [],
  selectedTab = SESSIONS_TAB_ID,
}: {
  collapsed?: boolean
  width?: number
  tabs?: readonly SidebarNavTabRow[]
  selectedTab?: string
} = {}) {
  const startSession = vi.fn()
  const toggleSidebar = vi.fn()
  const selectTab = vi.fn()
  let regionOwner: SidebarSectionOwnerProps | undefined
  let pageOwner: SidebarPageOwnerProps | undefined
  let pageKey: string | undefined
  let settingsOwner: SidebarSettingsOwnerProps | undefined
  let footerActionOwner: SidebarFooterActionOwnerProps | undefined
  let current = { collapsed, width, selectedTab }
  const root = () => (
    <SidebarRoot
      collapsed={current.collapsed} width={current.width}
      useSessions={neverHook} useWorkspaces={neverHook}
      useStore={selector => selector({ selectedTab: current.selectedTab })}
      actions={{ selectTab }}
      useNavTabs={selector => selector(tabs)}
      startSession={startSession} toggleSidebar={toggleSidebar} t={t}
      renderSlot={((
        key: string,
        owner: SidebarFooterActionOwnerProps | SidebarPageOwnerProps | SidebarSectionOwnerProps | SidebarSettingsOwnerProps,
        opts?: { entryKey?: string; only?: string },
      ) => {
        if (key === 'sidebar.settings') {
          settingsOwner = owner
          return <div data-testid="settings-seat" data-wide={owner.wide} />
        }
        if (key === 'sidebar.footer.action') {
          footerActionOwner = owner
          return <div data-testid="footer-action-seat" data-wide={owner.wide} />
        }
        if (key === 'sidebar.page') {
          pageOwner = owner as SidebarPageOwnerProps
          pageKey = opts?.entryKey
          return <div data-testid="plugin-page" data-wide={owner.wide} data-key={pageKey} />
        }
        regionOwner = owner as SidebarSectionOwnerProps
        return <div data-testid="region" data-wide={owner.wide} />
      }) as SidebarRootComponentProps['renderSlot']}
    />
  )
  const view = render(root())
  return {
    startSession,
    toggleSidebar,
    selectTab,
    regionOwner: () => {
      if (regionOwner === undefined) throw new Error('region owner not rendered')
      return regionOwner
    },
    pageOwner: () => {
      if (pageOwner === undefined) throw new Error('page owner not rendered')
      return pageOwner
    },
    pageKey: () => pageKey,
    settingsOwner: () => {
      if (settingsOwner === undefined) throw new Error('settings owner not rendered')
      return settingsOwner
    },
    footerActionOwner: () => {
      if (footerActionOwner === undefined) throw new Error('footer action owner not rendered')
      return footerActionOwner
    },
    rerender(next: Partial<typeof current>) {
      current = { ...current, ...next }
      view.rerender(root())
    },
  }
}

describe('SidebarRoot shell', () => {
  it('routes New Session (capsule + wordmark) and the column toggle', () => {
    const b = mountShell()
    // Expanded, both the wordmark and the capsule start a session.
    const starters = screen.getAllByRole('button', { name: 'New session' })
    expect(starters).toHaveLength(2)
    for (const button of starters) fireEvent.click(button)
    expect(b.startSession).toHaveBeenCalledTimes(2)
    fireEvent.click(screen.getByRole('button', { name: 'Collapse sidebar' }))
    expect(b.toggleSidebar).toHaveBeenCalledOnce()
  })

  it('hands the region its wide flag and clamps expandSidebar to the collapsed state', () => {
    const b = mountShell()
    expect(b.regionOwner().wide).toBe(true)
    // The settings seat rides the same wide flag (ui-settings renders the row).
    expect(b.settingsOwner().wide).toBe(true)
    expect(b.footerActionOwner().wide).toBe(true)
    // Expanded: the request is a no-op (no accidental collapse).
    b.regionOwner().expandSidebar()
    expect(b.toggleSidebar).not.toHaveBeenCalled()
  })

  it('keeps the region mounted through collapse and expands on its request', () => {
    vi.useFakeTimers()
    const b = mountShell()
    b.rerender({ collapsed: true })
    // Wide content survives the crossfade window, then settles into the rail.
    expect(b.regionOwner().wide).toBe(true)
    vi.advanceTimersByTime(200)
    b.rerender({})
    expect(b.regionOwner().wide).toBe(false)
    expect(b.footerActionOwner().wide).toBe(false)
    expect(screen.getByTestId('region')).toBeTruthy()
    b.regionOwner().expandSidebar()
    expect(b.toggleSidebar).toHaveBeenCalledOnce()
  })

  it('renders statically collapsed on a cold start (no crossfade classes)', () => {
    const b = mountShell({ collapsed: true })
    expect(b.regionOwner().wide).toBe(false)
    expect(screen.getByRole('button', { name: 'Open sidebar' })).toBeTruthy()
  })

  it('draws no tab strip when no plugin tabs are registered', () => {
    mountShell()
    expect(screen.queryByRole('tablist')).toBeNull()
    expect(screen.getByTestId('region')).toBeTruthy()
    expect(screen.queryByTestId('plugin-page')).toBeNull()
  })

  it('hides New Session and the workspace region when a plugin tab is selected', () => {
    const tabs = [{ id: 'bots', order: 0, label: 'Bots' }]
    const b = mountShell({ tabs, selectedTab: 'bots' })
    expect(screen.getByRole('tablist')).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'Sessions' }).getAttribute('aria-selected')).toBe('false')
    expect(screen.getByRole('tab', { name: 'Bots' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.queryByRole('button', { name: 'New session' })).toBeNull()
    expect(screen.queryByTestId('region')).toBeNull()
    expect(screen.getByTestId('plugin-page')).toBeTruthy()
    expect(b.pageKey()).toBe('bots')
    expect(b.pageOwner().wide).toBe(true)
    fireEvent.click(screen.getByRole('tab', { name: 'Sessions' }))
    expect(b.selectTab).toHaveBeenCalledWith(SESSIONS_TAB_ID)
  })
})
