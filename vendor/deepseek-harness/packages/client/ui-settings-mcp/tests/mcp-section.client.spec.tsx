// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { McpSection } from '../src/client/McpSection.tsx'
import type { McpSectionInjected, McpSectionProps } from '../src/client/McpSection.tsx'
import { en, type McpSettingsKey } from '../src/client/locales.ts'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const t = ((key: McpSettingsKey): string => en[key])

const managedStdio = {
  id: 'github-id',
  origin: 'managed',
  writable: true,
  enabled: true,
  fiberPhase: 'active',
  spec: {
    id: 'github-id',
    enabled: true,
    transport: 'stdio',
    serverName: 'github',
    command: 'npx',
    args: ['-y', '@mcp/github'],
    env: { TOKEN: 'secret' },
    cwd: '/workspace',
  },
} as const

const managedHttp = {
  id: 'remote-id',
  origin: 'managed',
  writable: true,
  enabled: true,
  fiberPhase: 'active',
  spec: {
    id: 'remote-id',
    enabled: true,
    transport: 'streamable-http',
    serverName: 'remote-managed',
    url: 'https://managed.example.test/api',
  },
} as const

const compositionHttp = {
  id: 'cordis:remote',
  origin: 'composition',
  writable: false,
  enabled: false,
  fiberPhase: 'failed',
  spec: {
    id: 'remote',
    enabled: false,
    transport: 'streamable-http',
    serverName: 'remote-tools',
    url: 'https://mcp.example.test/api',
    headers: { Authorization: 'Bearer token' },
  },
} as const

function props(partial: Partial<McpSectionInjected> = {}): McpSectionProps {
  return {
    t,
    list: async () => ({ servers: [] }),
    upsert: async () => {},
    remove: async () => {},
    setEnabled: async () => {},
    retry: async () => {},
    authorize: async () => {},
    ...partial,
  } as McpSectionProps
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

async function openAddEditor(partial: Partial<McpSectionInjected> = {}) {
  render(<McpSection {...props(partial)} />)
  fireEvent.click(await screen.findByRole('button', { name: en.add }))
  return screen.getByRole('dialog', { name: en.editorTitleAdd })
}

function selectFilter(option: string): void {
  fireEvent.click(screen.getByRole('button', { name: en.filterEnabled }))
  fireEvent.click(screen.getByRole('menuitem', { name: option }))
}

function pickTransport(dialog: HTMLElement, optionLabel: string): void {
  fireEvent.click(within(dialog).getByLabelText(en.transport))
  fireEvent.click(screen.getByRole('menuitem', { name: optionLabel }))
}

describe('McpSection', () => {
  it('searches name, ID, command, and URL and filters by enabled state', async () => {
    render(<McpSection {...props({ list: async () => ({ servers: [managedStdio, compositionHttp] }) })} />)
    const search = await screen.findByRole('searchbox', { name: en.search })
    expect(screen.getByRole('heading', { name: en.configuredCount.replace('{count}', '1') })).toBeTruthy()
    expect(screen.getByRole('heading', { name: en.compositionSection })).toBeTruthy()

    for (const term of ['github', 'github-id', 'npx', 'mcp.example.test']) {
      fireEvent.change(search, { target: { value: term } })
      expect(screen.getByText(term.includes('example') ? 'remote-tools' : 'github')).toBeTruthy()
      fireEvent.change(search, { target: { value: '' } })
    }

    selectFilter(en.filterDisabledOnly)
    expect(screen.getByText('remote-tools')).toBeTruthy()
    expect(screen.queryByText('github')).toBeNull()
  })

  it('shows distinct catalog-empty and no-result states and clears active filters', async () => {
    const { unmount } = render(<McpSection {...props()} />)
    expect(await screen.findByText(en.empty)).toBeTruthy()
    unmount()

    render(<McpSection {...props({ list: async () => ({ servers: [managedStdio] }) })} />)
    fireEvent.change(await screen.findByRole('searchbox', { name: en.search }), { target: { value: 'missing' } })
    expect(screen.getByText(en.emptySearch)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: en.clearFilters }))
    expect(screen.getByText('github')).toBeTruthy()
  })

  it('renders configured and composition sections as flat rows with status and a summary line', async () => {
    render(<McpSection {...props({ list: async () => ({ servers: [managedStdio, compositionHttp] }) })} />)
    expect(await screen.findByText(en.managed)).toBeTruthy()
    expect(screen.getByText(en.active)).toBeTruthy()
    expect(screen.getByText('stdio · npx -y @mcp/github · /workspace')).toBeTruthy()
    expect(screen.getByText(en.compositionNote)).toBeTruthy()
    expect(screen.getByText('HTTP · https://mcp.example.test/api')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Expand configuration/ })).toBeNull()
  })

  it('prefers live connection health over the fiber phase and surfaces the failure reason', async () => {
    const reconnecting = {
      ...managedStdio,
      connection: { health: 'reconnecting', lastError: 'Error: spawn ENOENT' },
    } as const
    render(<McpSection {...props({ list: async () => ({ servers: [reconnecting] }) })} />)
    expect(await screen.findByText(en.healthReconnecting)).toBeTruthy()
    expect(screen.queryByText(en.active)).toBeNull()
    expect(screen.getByText('Error: spawn ENOENT')).toBeTruthy()
    const runtime = screen.getByTitle(`${en.healthReconnecting}: Error: spawn ENOENT`)
    expect(runtime).toBeTruthy()

    cleanup()
    const deadComposition = {
      ...compositionHttp,
      connection: { health: 'failed' },
    } as const
    render(<McpSection {...props({ list: async () => ({ servers: [deadComposition] }) })} />)
    expect(await screen.findByText(en.healthFailed)).toBeTruthy()
    // Connection health wins on the same row; the fiber copy stays hidden.
    expect(screen.queryByText(en.failed)).toBeNull()

    // Without a reporting mcp-client the row falls back to the fiber phase.
    cleanup()
    render(<McpSection {...props({ list: async () => ({ servers: [compositionHttp] }) })} />)
    expect(await screen.findByText(en.failed)).toBeTruthy()
  })

  it('toggles one writable row optimistically without replacing the page and blocks duplicate toggles', async () => {
    const pending = deferred<undefined>()
    const setEnabled = vi.fn(() => pending.promise)
    const list = vi.fn(async () => ({ servers: [managedStdio] }))
    render(<McpSection {...props({ list, setEnabled })} />)
    const toggle = await screen.findByRole('switch', { name: en.enableAria.replace('{name}', 'github') })

    fireEvent.click(toggle)
    fireEvent.click(toggle)
    expect(setEnabled).toHaveBeenCalledTimes(1)
    expect(setEnabled).toHaveBeenCalledWith('github-id', false)
    expect(toggle.getAttribute('disabled')).not.toBeNull()
    expect(screen.getByRole('heading', { name: en.title })).toBeTruthy()
    expect(list).toHaveBeenCalledTimes(1)
    pending.resolve(undefined)
    await waitFor(() => { expect(toggle.getAttribute('disabled')).toBeNull() })
  })

  it('clears independent pending rows when concurrent toggles finish around a reload', async () => {
    const first = deferred<undefined>()
    const second = deferred<undefined>()
    const setEnabled = vi.fn((id: string) => id === managedStdio.id ? first.promise : second.promise)
    const list = vi.fn(async () => ({ servers: [managedStdio, managedHttp] }))
    render(<McpSection {...props({ list, setEnabled })} />)
    const firstToggle = await screen.findByRole('switch', { name: en.enableAria.replace('{name}', 'github') })
    const secondToggle = screen.getByRole('switch', { name: en.enableAria.replace('{name}', 'remote-managed') })

    fireEvent.click(firstToggle)
    fireEvent.click(secondToggle)
    first.resolve(undefined)
    await waitFor(() => { expect(list).toHaveBeenCalledTimes(2) })
    second.resolve(undefined)

    await waitFor(() => {
      expect(firstToggle.getAttribute('disabled')).toBeNull()
      expect(secondToggle.getAttribute('disabled')).toBeNull()
    })
  })

  it('reports a post-mutation refresh failure without stranding the row pending', async () => {
    const list = vi.fn()
      .mockResolvedValueOnce({ servers: [managedStdio] })
      .mockRejectedValueOnce(new Error('refresh unavailable'))
      .mockResolvedValueOnce({ servers: [managedStdio] })
    render(<McpSection {...props({ list })} />)
    const toggle = await screen.findByRole('switch', { name: en.enableAria.replace('{name}', 'github') })
    fireEvent.click(toggle)

    expect(await screen.findByText(en.refreshFailed)).toBeTruthy()
    expect(toggle.getAttribute('disabled')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: en.retry }))
    await waitFor(() => { expect(screen.queryByText(en.refreshFailed)).toBeNull() })
  })

  it('keeps a toggle error on its row and rolls back the optimistic value', async () => {
    const setEnabled = vi.fn(async () => { throw new Error('permission denied') })
    render(<McpSection {...props({ list: async () => ({ servers: [managedStdio] }), setEnabled })} />)
    const toggle = await screen.findByRole('switch', { name: en.enableAria.replace('{name}', 'github') }) as HTMLInputElement
    fireEvent.click(toggle)
    expect((await screen.findByRole('alert')).textContent).toContain('permission denied')
    await waitFor(() => { expect(toggle.checked).toBe(true) })
  })

  it('keeps composition rows read-only and retries an initial list failure', async () => {
    const list = vi.fn()
      .mockRejectedValueOnce(new Error('down'))
      .mockResolvedValueOnce({ servers: [compositionHttp] })
    render(<McpSection {...props({ list })} />)
    expect(await screen.findByText(en.error)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: en.retry }))
    expect(await screen.findByText(en.readOnly)).toBeTruthy()
    expect(screen.queryByRole('switch')).toBeNull()
    expect(screen.getByText(en.composition, { selector: 'span' })).toBeTruthy()
  })

  it('polls live connection health while the page is open', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    const list = vi.fn()
      .mockResolvedValueOnce({
        servers: [{ ...managedStdio, connection: { health: 'connecting' as const } }],
      })
      .mockResolvedValue({
        servers: [{ ...managedStdio, connection: { health: 'connected' as const } }],
      })
    render(<McpSection {...props({ list })} />)
    expect(await screen.findByText(en.healthConnecting)).toBeTruthy()
    await vi.advanceTimersByTimeAsync(2000)
    expect(await screen.findByText(en.healthConnected)).toBeTruthy()
  })

  it('lists registered tool names on a connected row', async () => {
    render(<McpSection {...props({
      list: async () => ({
        servers: [{
          ...managedStdio,
          connection: {
            health: 'connected' as const,
            tools: ['mcp__github__create_issue', 'mcp__github__list'],
          },
        }],
      }),
    })} />)
    expect(await screen.findByText(en.healthConnected)).toBeTruthy()
    expect(screen.getByText(/2 tools · mcp__github__create_issue, mcp__github__list/)).toBeTruthy()
  })

  it('remounts failed managed rows when refresh is clicked', async () => {
    const retry = vi.fn(async () => {})
    const failed = {
      ...managedStdio,
      connection: { health: 'failed' as const, lastError: 'Error: spawn ENOENT' },
    }
    const failedComposition = {
      ...compositionHttp,
      connection: { health: 'failed' as const, lastError: 'Error: missing bearer token' },
    }
    render(<McpSection {...props({
      list: async () => ({ servers: [failed, failedComposition] }),
      retry,
    })} />)
    expect((await screen.findAllByText(en.healthFailed)).length).toBe(2)
    expect(screen.getByText('Error: missing bearer token')).toBeTruthy()
    expect(screen.queryByText(en.healthConnected)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: en.refresh }))
    await waitFor(() => { expect(retry).toHaveBeenCalledWith('github-id') })
    expect(retry).toHaveBeenCalledTimes(1)
    expect(retry).not.toHaveBeenCalledWith(failedComposition.id)
  })

  it('signs in a failed managed HTTP row so the Host can mount tools', async () => {
    const authorize = vi.fn(async () => {})
    const failedHttp = {
      ...managedHttp,
      connection: { health: 'failed' as const, lastError: 'Error: missing bearer token' },
    }
    const failedStdio = {
      ...managedStdio,
      connection: { health: 'failed' as const, lastError: 'Error: spawn ENOENT' },
    }
    render(<McpSection {...props({
      list: async () => ({ servers: [failedHttp, failedStdio, compositionHttp] }),
      authorize,
    })} />)
    expect(await screen.findByRole('button', { name: en.signInFor.replace('{name}', 'remote-managed') })).toBeTruthy()
    expect(screen.queryByRole('button', { name: en.signInFor.replace('{name}', 'github') })).toBeNull()
    expect(screen.queryByRole('button', { name: en.signInFor.replace('{name}', 'remote-tools') })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: en.signInFor.replace('{name}', 'remote-managed') }))
    await waitFor(() => { expect(authorize).toHaveBeenCalledWith('remote-id') })
  })


  it('groups the add form, warns about stdio execution, and saves valid KEY=value lines', async () => {
    const upsert = vi.fn(async () => {})
    const dialog = await openAddEditor({ upsert })
    expect(within(dialog).getByText(en.generalGroup)).toBeTruthy()
    expect(within(dialog).getByText(en.connectionGroup)).toBeTruthy()
    expect(within(dialog).getByText(en.stdioRiskTitle)).toBeTruthy()

    fireEvent.change(within(dialog).getByLabelText(en.id), { target: { value: 'memory' } })
    fireEvent.change(within(dialog).getByLabelText(en.command), { target: { value: 'mcp-memory' } })
    fireEvent.click(within(dialog).getByRole('button', { name: en.envToggle }))
    fireEvent.change(within(dialog).getByLabelText(en.env), { target: { value: 'TOKEN=\nMODE=a=b' } })
    fireEvent.click(within(dialog).getByRole('button', { name: en.save }))
    await waitFor(() => {
      expect(upsert).toHaveBeenCalledWith(expect.objectContaining({
        id: 'memory',
        serverName: 'memory',
        command: 'mcp-memory',
        env: { TOKEN: '', MODE: 'a=b' },
      }))
    })
  })

  it('validates URL and every KEY=value line with accessible field errors', async () => {
    const dialog = await openAddEditor()
    fireEvent.change(within(dialog).getByLabelText(en.id), { target: { value: 'remote' } })
    pickTransport(dialog, en.http)
    const url = within(dialog).getByLabelText(en.url)
    const headers = within(dialog).getByLabelText(en.headers)
    fireEvent.change(url, { target: { value: 'ftp://example.test/mcp' } })
    fireEvent.change(headers, { target: { value: 'Authorization\nX-Valid=yes' } })
    fireEvent.click(within(dialog).getByRole('button', { name: en.save }))

    expect(within(dialog).getByText(en.urlInvalid)).toBeTruthy()
    expect(within(dialog).getByText(en.headerLineInvalid.replace('{line}', '1'))).toBeTruthy()
    expect(url.getAttribute('aria-invalid')).toBe('true')
    expect(headers.getAttribute('aria-invalid')).toBe('true')
    expect(url.getAttribute('aria-describedby')).toContain('url-error')
    expect(headers.getAttribute('aria-describedby')).toContain('headers-error')
  })

  it('preserves independent stdio and HTTP drafts while switching transport branches', async () => {
    const dialog = await openAddEditor()
    fireEvent.change(within(dialog).getByLabelText(en.command), { target: { value: 'npx preserved' } })
    fireEvent.click(within(dialog).getByRole('button', { name: en.envToggle }))
    fireEvent.change(within(dialog).getByLabelText(en.env), { target: { value: 'TOKEN=stdio' } })

    pickTransport(dialog, en.http)
    fireEvent.change(within(dialog).getByLabelText(en.url), { target: { value: 'https://example.test/mcp' } })
    fireEvent.change(within(dialog).getByLabelText(en.headers), { target: { value: 'TOKEN=http' } })

    pickTransport(dialog, en.stdio)
    expect(within(dialog).getByLabelText<HTMLInputElement>(en.command).value).toBe('npx preserved')
    expect(within(dialog).getByLabelText<HTMLTextAreaElement>(en.env).value).toBe('TOKEN=stdio')

    pickTransport(dialog, en.http)
    expect(within(dialog).getByLabelText<HTMLInputElement>(en.url).value).toBe('https://example.test/mcp')
    expect(within(dialog).getByLabelText<HTMLTextAreaElement>(en.headers).value).toBe('TOKEN=http')
  })

  it('keeps remote save errors in the Modal and prevents duplicate saves while pending', async () => {
    const pending = deferred<undefined>()
    const upsert = vi.fn(() => pending.promise)
    const dialog = await openAddEditor({ upsert })
    fireEvent.change(within(dialog).getByLabelText(en.id), { target: { value: 'memory' } })
    fireEvent.change(within(dialog).getByLabelText(en.command), { target: { value: 'memory-server' } })
    const save = within(dialog).getByRole('button', { name: en.save })
    fireEvent.click(save)
    fireEvent.click(save)
    expect(upsert).toHaveBeenCalledTimes(1)
    expect(save.getAttribute('disabled')).not.toBeNull()

    pending.reject(new Error('remote rejected'))
    expect((await within(dialog).findByRole('alert')).textContent).toContain('remote rejected')
    expect(screen.getByRole('dialog', { name: en.editorTitleAdd })).toBeTruthy()
  })

  it('uses row icon actions for edit and delete and keeps delete errors in the confirmation Modal', async () => {
    const remove = vi.fn(async () => { throw new Error('cannot remove') })
    render(<McpSection {...props({ list: async () => ({ servers: [managedStdio] }), remove })} />)
    await screen.findByText('github')

    fireEvent.click(screen.getByRole('button', { name: en.editFor.replace('{name}', 'github') }))
    expect(screen.getByRole('dialog', { name: en.editorTitleEdit })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: en.cancel }))

    fireEvent.click(screen.getByRole('button', { name: en.removeFor.replace('{name}', 'github') }))
    const confirmation = screen.getByRole('dialog', { name: en.deleteTitle.replace('{name}', 'github') })
    fireEvent.click(within(confirmation).getByRole('button', { name: en.deleteConfirm }))
    expect((await within(confirmation).findByRole('alert')).textContent).toContain('cannot remove')
    expect(remove).toHaveBeenCalledTimes(1)
  })

  it('round-trips a named JSON object and an mcpServers wrapper into the same record', async () => {
    const upsert = vi.fn(async () => {})
    const dialog = await openAddEditor({ upsert })
    fireEvent.click(within(dialog).getByRole('button', { name: en.editorModeJson }))
    fireEvent.change(within(dialog).getByLabelText(en.jsonLabel), {
      target: {
        value: JSON.stringify({
          mcpServers: {
            memory: {
              type: 'stdio',
              command: 'mcp-memory',
              args: ['--port', '9'],
              toolCallTimeoutMs: 4000,
            },
          },
        }),
      },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: en.editorModeForm }))
    expect(within(dialog).getByLabelText<HTMLInputElement>(en.id).value).toBe('memory')
    expect(within(dialog).getByLabelText<HTMLInputElement>(en.command).value).toBe('mcp-memory')
    expect(within(dialog).getByLabelText<HTMLInputElement>(en.args).value).toBe('--port 9')
    expect(within(dialog).getByLabelText<HTMLInputElement>(en.timeout).value).toBe('4000')

    fireEvent.click(within(dialog).getByRole('button', { name: en.editorModeJson }))
    fireEvent.change(within(dialog).getByLabelText(en.jsonLabel), {
      target: {
        value: JSON.stringify({
          remote: { url: 'https://mcp.example.test/api' },
        }),
      },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: en.save }))
    await waitFor(() => {
      expect(upsert).toHaveBeenCalledWith({
        id: 'remote',
        serverName: 'remote',
        enabled: true,
        transport: 'streamable-http',
        url: 'https://mcp.example.test/api',
      })
    })
  })
})
