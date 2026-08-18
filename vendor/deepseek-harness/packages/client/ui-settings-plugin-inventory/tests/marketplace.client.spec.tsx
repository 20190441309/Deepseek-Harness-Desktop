// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MarketplaceSettingsTab } from '../src/client/MarketplaceSettingsTab.tsx'
import type { MarketplaceSettingsTabProps } from '../src/client/MarketplaceSettingsTab.tsx'
import type { MarketplaceCatalog } from '../src/client/desktop-shell.ts'
import { en, type PluginInventoryLocaleKey } from '../src/client/locales.ts'

afterEach(cleanup)

const t = ((key: PluginInventoryLocaleKey): string => en[key]) as MarketplaceSettingsTabProps['t']

const ITEM = {
  id: 'owner/dsh-loop',
  owner: 'owner',
  repo: 'dsh-loop',
  description: 'loop workflow',
  stars: 3,
  packageName: '@dsh-external/dsh-loop',
  homepage: 'https://github.com/owner/dsh-loop',
  installSpec: 'github:owner/dsh-loop#abc',
  isBundle: true,
  category: 'workflow',
  updated: '2024-01-01T00:00:00Z',
  pushed: '2024-01-01T00:00:00Z',
  license: 'MIT',
  topics: ['dsh-plugin'],
}

const DOC = {
  ...ITEM,
  id: 'owner/awesome',
  repo: 'awesome',
  packageName: '',
  description: '',
  isBundle: false,
  category: 'mystery',
  installSpec: 'github:owner/awesome#main',
  homepage: 'https://github.com/owner/awesome',
  stars: 1,
  updated: '2026-08-01T00:00:00Z',
  pushed: '2026-08-01T00:00:00Z',
  license: '',
  topics: [],
}

function renderTab(overrides: Partial<MarketplaceSettingsTabProps> = {}) {
  const props = {
    t,
    listMarketplace: vi.fn(async () => ({
      items: [ITEM, DOC],
      categories: [
        { id: 'all', label: 'All', count: 2 },
        { id: 'workflow', label: 'Workflow', count: 1 },
        { id: 'other', label: 'Other', count: 1 },
      ],
      warning: 'stale cache',
    })),
    listInstalled: vi.fn(async () => ({ plugins: [] })),
    installMarketplacePlugin: vi.fn(async () => ({ ok: true })),
    uninstallPlugin: vi.fn(async () => ({ ok: true })),
    close: vi.fn(),
    openExternal: vi.fn(async () => true),
    onProgress: vi.fn((handler: (payload: { line?: string }) => void) => {
      handler({ line: 'cloning' })
      handler({})
      return () => {}
    }),
    ...overrides,
  } as MarketplaceSettingsTabProps
  const view = render(<MarketplaceSettingsTab {...props} />)
  return { props, ...view }
}

function openCard(repo: string) {
  fireEvent.click(screen.getByRole('button', { name: repo }))
  return screen.getByRole('dialog', { name: repo })
}

function pickMenu(label: string, option: string) {
  fireEvent.click(screen.getByRole('button', { name: label }))
  fireEvent.click(screen.getByRole('menuitem', { name: option }))
}

function dialogMask(name: string) {
  const dialog = screen.getByRole('dialog', { name })
  return dialog.parentElement?.querySelector('[data-dsh-motion-part="mask"]') as HTMLElement
}

describe('MarketplaceSettingsTab', () => {
  it('filters by category, status, and search, and has no token field', async () => {
    renderTab()
    await waitFor(() => { expect(screen.getByText('dsh-loop')).toBeTruthy() })
    expect(screen.getByText('stale cache')).toBeTruthy()
    expect(screen.getByRole('tab', { name: /Workflow/ })).toBeTruthy()
    expect(screen.getByRole('tab', { name: new RegExp(en.marketOther) })).toBeTruthy()
    expect(screen.queryByRole('button', { name: en.marketInstall })).toBeNull()
    expect(screen.queryByLabelText(/token/i)).toBeNull()
    expect(screen.queryByRole('combobox')).toBeNull()

    const categories = screen.getByRole('tablist', { name: en.marketCategories })
    fireEvent.click(within(categories).getByRole('tab', { name: /Workflow/ }))
    expect(screen.queryByText('awesome')).toBeNull()
    fireEvent.click(within(categories).getByRole('tab', { name: /All/ }))
    pickMenu(en.marketStatus, en.marketInstallable)
    expect(screen.getByText('dsh-loop')).toBeTruthy()
    expect(screen.queryByText('awesome')).toBeNull()
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'missing' } })
    expect(screen.getByText(en.marketEmpty)).toBeTruthy()
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'loop' } })
    expect(screen.getByText('dsh-loop')).toBeTruthy()
  })

  it('installs by catalog id from a confirm Modal that shows the install spec', async () => {
    const pending = Promise.withResolvers<{ ok: boolean }>()
    const installMarketplacePlugin = vi.fn(() => pending.promise)
    const { props } = renderTab({ installMarketplacePlugin })
    await waitFor(() => { expect(screen.getByText('dsh-loop')).toBeTruthy() })

    const detail = openCard('dsh-loop')
    expect(within(detail).getByText(ITEM.installSpec)).toBeTruthy()
    expect(within(detail).getByText('MIT')).toBeTruthy()
    expect(within(detail).getByText('2024-01-01')).toBeTruthy()
    fireEvent.click(within(detail).getByRole('button', { name: en.marketInstall }))
    expect(props.close).not.toHaveBeenCalled()
    expect(props.installMarketplacePlugin).not.toHaveBeenCalled()

    const confirm = screen.getByRole('dialog', { name: en.marketInstallTitle })
    expect(within(confirm).getByText(ITEM.installSpec)).toBeTruthy()
    fireEvent.click(within(confirm).getByRole('button', { name: en.marketInstall }))
    await waitFor(() => {
      expect(props.installMarketplacePlugin).toHaveBeenCalledWith('owner/dsh-loop')
    })
    expect(props.installMarketplacePlugin).toHaveBeenCalledTimes(1)
    expect(props.close).not.toHaveBeenCalled()
    expect(within(screen.getByRole('dialog', { name: en.marketInstallTitle })).getByText('cloning')).toBeTruthy()
    await act(async () => { pending.resolve({ ok: true }) })

    fireEvent.click(within(detail).getByRole('button', { name: en.marketRepo }))
    expect(props.openExternal).toHaveBeenCalledWith(ITEM.homepage)
    fireEvent.click(within(detail).getByRole('button', { name: en.marketClose }))
    expect(screen.queryByRole('dialog', { name: 'dsh-loop' })).toBeNull()
  })

  it('retries install with allowBuilds after a second confirm', async () => {
    const installMarketplacePlugin = vi.fn()
      .mockResolvedValueOnce({ ok: false, needsAllowBuilds: true, allowBuilds: ['@dsh-external/dsh-loop'] })
      .mockResolvedValueOnce({ ok: true })
    const { props } = renderTab({ installMarketplacePlugin })
    await waitFor(() => { expect(screen.getByText('dsh-loop')).toBeTruthy() })
    const detail = openCard('dsh-loop')
    fireEvent.click(within(detail).getByRole('button', { name: en.marketInstall }))
    fireEvent.click(within(screen.getByRole('dialog', { name: en.marketInstallTitle })).getByRole('button', { name: en.marketInstall }))
    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: en.marketAllowBuildsTitle })).toBeTruthy()
    })
    expect(screen.getByText(en.marketAllowBuildsBody.replace('{packages}', '@dsh-external/dsh-loop'))).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: en.marketAllowBuildsOk }))
    await waitFor(() => {
      expect(props.installMarketplacePlugin).toHaveBeenNthCalledWith(2, 'owner/dsh-loop', {
        allowBuilds: ['@dsh-external/dsh-loop'],
      })
    })
    expect(props.close).not.toHaveBeenCalled()
  })

  it('sorts by stars and then by last push', async () => {
    renderTab()
    await waitFor(() => { expect(screen.getByRole('button', { name: 'dsh-loop' })).toBeTruthy() })
    expect([...document.querySelectorAll('[data-market-card]')].map(node => node.getAttribute('data-market-card')))
      .toEqual(['owner/dsh-loop', 'owner/awesome'])
    pickMenu(en.marketSort, en.marketSortNew)
    expect([...document.querySelectorAll('[data-market-card]')].map(node => node.getAttribute('data-market-card')))
      .toEqual(['owner/awesome', 'owner/dsh-loop'])
    pickMenu(en.marketSort, en.marketSortHot)
    expect([...document.querySelectorAll('[data-market-card]')].map(node => node.getAttribute('data-market-card')))
      .toEqual(['owner/dsh-loop', 'owner/awesome'])
  })

  it('keeps a 1-star plugin after higher star counts and drops duplicate ids', async () => {
    renderTab({
      listMarketplace: vi.fn(async () => ({
        items: [
          { ...ITEM, id: 'xiaomiba/dsh-obsidian-export', repo: 'dsh-obsidian-export', stars: 1 },
          { ...ITEM, id: 'xiaomiba/dsh-obsidian-export', repo: 'dsh-obsidian-export', stars: 1 },
          { ...ITEM, id: 'zhu/dsh-web-ui', repo: 'dsh-web-ui', stars: '1132' as unknown as number },
          { ...ITEM, id: 'paean/deeptide', repo: 'deeptide', stars: 1040 },
        ],
        categories: [{ id: 'all', label: 'All', count: 3 }],
      })),
    })
    await waitFor(() => { expect(screen.getByRole('button', { name: 'dsh-web-ui' })).toBeTruthy() })
    const left = [...document.querySelectorAll('[data-market-col="0"] [data-market-card]')]
      .map(node => node.getAttribute('data-market-card'))
    const right = [...document.querySelectorAll('[data-market-col="1"] [data-market-card]')]
      .map(node => node.getAttribute('data-market-card'))
    expect(left[0]).toBe('zhu/dsh-web-ui')
    expect(right[0]).toBe('paean/deeptide')
    expect([...left, ...right].filter(id => id === 'xiaomiba/dsh-obsidian-export')).toEqual(['xiaomiba/dsh-obsidian-export'])
    expect(screen.getAllByRole('button', { name: 'dsh-obsidian-export' })).toHaveLength(1)
  })

  it('closes the detail dialog from the backdrop without unmounting immediately', async () => {
    renderTab()
    await waitFor(() => { expect(screen.getByRole('button', { name: 'awesome' })).toBeTruthy() })
    const detail = openCard('awesome')
    expect(within(detail).getByText('—')).toBeTruthy()
    fireEvent.click(within(detail).getByText(en.marketNoDescription))
    expect(screen.getByRole('dialog', { name: 'awesome' })).toBeTruthy()
    fireEvent.click(dialogMask('awesome'))
    expect(screen.queryByRole('dialog', { name: 'awesome' })).toBeNull()
    openCard('awesome')
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: 'awesome' })).toBeNull()
  })

  it('uninstalls a matched spec and reports a failure', async () => {
    const { props } = renderTab({
      listInstalled: vi.fn(async () => ({ plugins: [{ name: '@dsh-external/dsh-loop', spec: 'github:owner/dsh-loop#abc' }] })),
      uninstallPlugin: vi.fn(async () => ({ ok: false, error: 'busy' })),
    })
    await waitFor(() => { expect(screen.getByText('dsh-loop')).toBeTruthy() })
    pickMenu(en.marketStatus, en.marketInstalled)
    const detail = openCard('dsh-loop')
    fireEvent.click(within(detail).getByRole('button', { name: en.marketRemove }))
    const confirm = screen.getByRole('dialog', { name: en.marketRemoveTitle })
    fireEvent.click(within(confirm).getByRole('button', { name: en.marketRemoveOk }))
    await waitFor(() => { expect(props.uninstallPlugin).toHaveBeenCalledWith('@dsh-external/dsh-loop') })
    await waitFor(() => { expect(screen.getByText('busy')).toBeTruthy() })
    fireEvent.click(screen.getByRole('button', { name: en.marketOk }))
    expect(screen.queryByRole('dialog', { name: en.marketFailTitle })).toBeNull()

    pickMenu(en.marketStatus, en.marketStatusAll)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: en.marketRefresh }).hasAttribute('disabled')).toBe(false)
    })
    fireEvent.click(screen.getByRole('button', { name: en.marketRefresh }))
    await waitFor(() => { expect(props.listMarketplace).toHaveBeenCalledWith({ refresh: true }) })
  })

  it('shows a dismissible failure Modal when installMarketplacePlugin rejects', async () => {
    renderTab({
      installMarketplacePlugin: vi.fn(async () => { throw new Error('Harness did not start') }),
    })
    await waitFor(() => { expect(screen.getByText('dsh-loop')).toBeTruthy() })
    const detail = openCard('dsh-loop')
    fireEvent.click(within(detail).getByRole('button', { name: en.marketInstall }))
    fireEvent.click(within(screen.getByRole('dialog', { name: en.marketInstallTitle })).getByRole('button', { name: en.marketInstall }))
    await waitFor(() => { expect(screen.getByRole('dialog', { name: en.marketFailTitle })).toBeTruthy() })
    expect(screen.getByText('Harness did not start')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: en.marketOk }))
    expect(screen.queryByRole('dialog', { name: en.marketFailTitle })).toBeNull()
  })

  it('shows a dismissible failure Modal when uninstallPlugin rejects', async () => {
    renderTab({
      listInstalled: vi.fn(async () => ({ plugins: [{ name: '@dsh-external/dsh-loop', spec: 'github:owner/dsh-loop#abc' }] })),
      uninstallPlugin: vi.fn(async () => { throw new Error('profile lock') }),
    })
    await waitFor(() => { expect(screen.getByText('dsh-loop')).toBeTruthy() })
    pickMenu(en.marketStatus, en.marketInstalled)
    const detail = openCard('dsh-loop')
    fireEvent.click(within(detail).getByRole('button', { name: en.marketRemove }))
    fireEvent.click(within(screen.getByRole('dialog', { name: en.marketRemoveTitle })).getByRole('button', { name: en.marketRemoveOk }))
    await waitFor(() => { expect(screen.getByRole('dialog', { name: en.marketFailTitle })).toBeTruthy() })
    expect(screen.getByText('profile lock')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: en.marketOk }))
    expect(screen.queryByRole('dialog', { name: en.marketFailTitle })).toBeNull()
  })

  it('shows a loading status until the catalog resolves', async () => {
    let resolveCatalog!: (value: MarketplaceCatalog) => void
    renderTab({
      listMarketplace: vi.fn(() => new Promise<MarketplaceCatalog>((resolve) => { resolveCatalog = resolve })),
    })
    expect(screen.getByText(en.marketLoading)).toBeTruthy()
    await act(async () => {
      resolveCatalog({ items: [ITEM], categories: [{ id: 'all', label: 'All', count: 1 }] })
    })
    await waitFor(() => { expect(screen.getByText('dsh-loop')).toBeTruthy() })
  })

  it('keeps the current catalog when a refresh returns no items', async () => {
    const listMarketplace = vi.fn()
      .mockResolvedValueOnce({ items: [ITEM], categories: [{ id: 'all', label: 'All', count: 1 }] })
      .mockResolvedValueOnce({ items: [], warning: '请求过于频繁', categories: [] })
    renderTab({ listMarketplace })
    await waitFor(() => { expect(screen.getByText('dsh-loop')).toBeTruthy() })
    fireEvent.click(screen.getByRole('button', { name: en.marketRefresh }))
    await waitFor(() => { expect(listMarketplace).toHaveBeenCalledWith({ refresh: true }) })
    expect(screen.getByText('dsh-loop')).toBeTruthy()
    expect(screen.getByText('请求过于频繁')).toBeTruthy()
    expect(screen.queryByText(en.marketEmpty)).toBeNull()
  })

  it('does not treat a rate-limited catalog as an empty category', async () => {
    renderTab({
      listMarketplace: vi.fn(async () => ({ items: [], warning: '请求过于频繁', categories: [] })),
    })
    await waitFor(() => { expect(screen.getByText('请求过于频繁')).toBeTruthy() })
    expect(screen.queryByText(en.marketEmpty)).toBeNull()
  })

  it('reports a catalog failure', async () => {
    renderTab({
      listMarketplace: vi.fn(async () => { throw new Error('offline') }),
    })
    await waitFor(() => { expect(screen.getByText(en.marketError)).toBeTruthy() })
    expect(screen.queryByText(en.marketEmpty)).toBeNull()
  })

  it('matches an installed plugin by github spec when the package name is missing', async () => {
    renderTab({
      listMarketplace: vi.fn(async () => ({
        items: [{ ...ITEM, packageName: '' }],
        categories: [{ id: 'all', label: 'All', count: 1 }],
      })),
      listInstalled: vi.fn(async () => ({ plugins: [{ name: 'loop', spec: 'github:owner/dsh-loop#abc' }] })),
    })
    await waitFor(() => { expect(screen.getByText(en.marketInstalled)).toBeTruthy() })
  })

  it('renders 60 cards first and appends 60 more, then resets on query or category change', async () => {
    const items = Array.from({ length: 61 }, (_, index) => ({
      ...ITEM,
      id: `owner/plugin-${index}`,
      repo: `plugin-${index}`,
      stars: 61 - index,
    }))
    renderTab({
      listMarketplace: vi.fn(async () => ({
        items,
        categories: [
          { id: 'all', label: 'All', count: 61 },
          { id: 'workflow', label: 'Workflow', count: 61 },
        ],
      })),
    })
    await waitFor(() => { expect(screen.getByRole('button', { name: 'plugin-0' })).toBeTruthy() })
    expect(document.querySelectorAll('[data-market-card]')).toHaveLength(60)
    fireEvent.click(screen.getByRole('button', { name: en.marketShowMore }))
    expect(document.querySelectorAll('[data-market-card]')).toHaveLength(61)
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'plugin' } })
    expect(document.querySelectorAll('[data-market-card]')).toHaveLength(60)
    fireEvent.click(screen.getByRole('button', { name: en.marketShowMore }))
    expect(document.querySelectorAll('[data-market-card]')).toHaveLength(61)
    fireEvent.click(within(screen.getByRole('tablist', { name: en.marketCategories })).getByRole('tab', { name: /Workflow/ }))
    expect(document.querySelectorAll('[data-market-card]')).toHaveLength(60)
  })

  it('expands category chips from the default two-row clip', async () => {
    renderTab()
    await waitFor(() => { expect(screen.getByText('dsh-loop')).toBeTruthy() })
    const expand = screen.getByRole('button', { name: en.marketExpandCategories })
    fireEvent.click(expand)
    expect(screen.getByRole('button', { name: en.marketCollapseCategories })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: en.marketCollapseCategories }))
    expect(screen.getByRole('button', { name: en.marketExpandCategories })).toBeTruthy()
  })

  it('reloads the catalog when t changes', async () => {
    const listMarketplace = vi.fn(async () => ({
      items: [ITEM],
      categories: [{ id: 'all', label: 'All', count: 1 }],
    }))
    const { props, rerender } = renderTab({ listMarketplace })
    await waitFor(() => { expect(screen.getByText('dsh-loop')).toBeTruthy() })
    expect(listMarketplace).toHaveBeenCalledTimes(1)
    const nextT = ((key: PluginInventoryLocaleKey): string => en[key]) as MarketplaceSettingsTabProps['t']
    rerender(<MarketplaceSettingsTab {...props} t={nextT} />)
    await waitFor(() => { expect(listMarketplace).toHaveBeenCalledTimes(2) })
  })
})
