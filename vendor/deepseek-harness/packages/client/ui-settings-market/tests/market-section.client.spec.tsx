// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MarketSection } from '../src/client/MarketSection.tsx'
import type { MarketSectionProps } from '../src/client/MarketSection.tsx'
import type { MarketCatalog, MarketItem } from '../src/client/desktop-shell.ts'
import { en, type MarketLocaleKey } from '../src/client/locales.ts'

afterEach(cleanup)

const t = ((key: MarketLocaleKey, vars?: Record<string, string>): string => {
  let text: string = en[key]
  for (const [name, value] of Object.entries(vars ?? {})) text = text.replaceAll(`{${name}}`, value)
  return text
}) as MarketSectionProps['t']

function item(overrides: Partial<MarketItem> = {}): MarketItem {
  return {
    id: 'acme/demo',
    owner: 'acme',
    repo: 'demo',
    description: 'A demo plugin',
    stars: 12,
    packageName: 'demo',
    homepage: 'https://github.com/acme/demo',
    installSpec: 'demo',
    category: 'workflow',
    npm: 'demo',
    ...overrides,
  }
}

function catalog(items: MarketItem[], overrides: Partial<MarketCatalog> = {}): MarketCatalog {
  return {
    ok: true,
    items,
    categories: [
      { id: 'all', label: 'All', count: items.length },
      { id: 'workflow', label: 'Workflow', count: items.filter(row => row.category === 'workflow').length },
    ],
    fetchedAt: Date.now(),
    source: 'live',
    warning: '',
    ...overrides,
  }
}

function renderMarket(overrides: Partial<MarketSectionProps> = {}) {
  const props = {
    close: vi.fn(),
    t,
    listCatalog: vi.fn(async () => catalog([item()])),
    listInstalled: vi.fn(async () => []),
    install: vi.fn(async () => ({ ok: true, harnessStarted: true })),
    uninstall: vi.fn(async () => ({ ok: true, harnessStarted: true })),
    onProgress: vi.fn(() => () => {}),
    ...overrides,
  } as unknown as MarketSectionProps
  render(<MarketSection {...props} />)
  return props
}

describe('MarketSection', () => {
  it('renders the catalog with search, categories, and install actions', async () => {
    renderMarket({
      listCatalog: vi.fn(async () => catalog([
        item(),
        item({ id: 'acme/other', repo: 'other', packageName: 'other', description: 'Second row', category: 'theme' }),
      ])),
    })
    await screen.findByText('demo')
    expect(screen.getByText('other')).toBeTruthy()
    expect(screen.getAllByRole('button', { name: en.install })).toHaveLength(2)
    fireEvent.change(screen.getByRole('searchbox', { name: en.search }), { target: { value: 'second' } })
    await waitFor(() => { expect(screen.queryByText('demo')).toBeNull() })
    expect(screen.getByText('other')).toBeTruthy()
  })

  it('filters by category chips', async () => {
    renderMarket({
      listCatalog: vi.fn(async () => catalog([
        item(),
        item({ id: 'acme/paint', repo: 'paint', packageName: 'paint', category: 'theme' }),
      ])),
    })
    await screen.findByText('demo')
    fireEvent.click(screen.getByRole('radio', { name: /Workflow/ }))
    await waitFor(() => { expect(screen.queryByText('paint')).toBeNull() })
    expect(screen.getByText('demo')).toBeTruthy()
  })

  it('shows a retry-able failure when the catalog cannot load', async () => {
    const listCatalog = vi.fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(catalog([item()]))
    renderMarket({ listCatalog: listCatalog as unknown as MarketSectionProps['listCatalog'] })
    await screen.findByRole('alert')
    fireEvent.click(screen.getByRole('button', { name: en.retry }))
    await screen.findByText('demo')
  })

  it('installs by catalog id and reports success', async () => {
    const props = renderMarket()
    fireEvent.click(await screen.findByRole('button', { name: en.install }))
    await waitFor(() => { expect(props.install).toHaveBeenCalledWith('acme/demo', undefined) })
    await screen.findByText(en.installDone)
    expect(props.listInstalled).toHaveBeenCalled()
  })

  it('surfaces install failures instead of staying silent', async () => {
    renderMarket({
      install: vi.fn(async () => ({ ok: false, error: '安装失败' })) as unknown as MarketSectionProps['install'],
    })
    fireEvent.click(await screen.findByRole('button', { name: en.install }))
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('安装失败')
  })

  it('asks before allowing build scripts and retries with the keys', async () => {
    const install = vi.fn()
      .mockResolvedValueOnce({ ok: false, needsAllowBuilds: true, allowBuilds: ['demo@git+https://github.com/acme/demo.git'] })
      .mockResolvedValueOnce({ ok: true, harnessStarted: true })
    const props = renderMarket({ install: install as unknown as MarketSectionProps['install'] })
    fireEvent.click(await screen.findByRole('button', { name: en.install }))
    await screen.findByRole('alertdialog')
    fireEvent.click(screen.getByRole('button', { name: en.allowBuildsConfirm }))
    await waitFor(() => {
      expect(props.install).toHaveBeenLastCalledWith('acme/demo', {
        allowBuilds: ['demo@git+https://github.com/acme/demo.git'],
      })
    })
    await screen.findByText(en.installDone)
  })

  it('offers uninstall for installed rows and reports harness-down failures', async () => {
    const props = renderMarket({
      listInstalled: vi.fn(async () => [{ name: 'demo', spec: '1.0.0' }]),
      uninstall: vi.fn(async () => ({ ok: true, harnessStarted: false, error: en.harnessDown })) as unknown as MarketSectionProps['uninstall'],
    })
    fireEvent.click(await screen.findByRole('button', { name: en.uninstall }))
    await waitFor(() => { expect(props.uninstall).toHaveBeenCalledWith('demo') })
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toBe(en.harnessDown)
  })

  it('streams progress lines during an install', async () => {
    let publish: ((payload: { phase: string, line?: string }) => void) | null = null
    let resolveInstall: ((value: { ok: boolean, harnessStarted: boolean }) => void) | null = null
    renderMarket({
      onProgress: vi.fn((listener: (payload: { phase: string, line?: string }) => void) => {
        publish = listener
        return () => { publish = null }
      }) as unknown as MarketSectionProps['onProgress'],
      install: vi.fn(() => new Promise((resolve) => { resolveInstall = resolve })) as unknown as MarketSectionProps['install'],
    })
    fireEvent.click(await screen.findByRole('button', { name: en.install }))
    await waitFor(() => { expect(publish).not.toBeNull() })
    publish!({ phase: 'log', line: 'resolving demo' })
    publish!({ phase: 'restart' })
    const log = await screen.findByRole('log')
    expect(log.textContent).toContain('resolving demo')
    expect(log.textContent).toContain(en.restarting)
    resolveInstall!({ ok: true, harnessStarted: true })
    await screen.findByText(en.installDone)
  })
})
