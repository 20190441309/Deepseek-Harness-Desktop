// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { McpSection } from '../src/client/McpSection.tsx'
import type { McpSectionInjected, McpSectionProps } from '../src/client/McpSection.tsx'
import { en, type McpSettingsKey } from '../src/client/locales.ts'

afterEach(cleanup)

const t = ((key: McpSettingsKey): string => en[key]) as McpSectionInjected['t']

function props(partial: Partial<McpSectionInjected>): McpSectionProps {
  return {
    t,
    list: async () => ({ servers: [] }),
    upsert: async () => {},
    remove: async () => {},
    setEnabled: async () => {},
    ...partial,
  } as McpSectionProps
}

describe('McpSection', () => {
  it('lists a managed server and toggles it', async () => {
    const setEnabled = vi.fn(async () => {})
    render(<McpSection {...props({
      list: async () => ({
        servers: [{
          id: 'github',
          origin: 'managed',
          writable: true,
          enabled: true,
          fiberPhase: 'active',
          spec: {
            id: 'github',
            enabled: true,
            transport: 'stdio',
            serverName: 'github',
            command: 'npx',
          },
        }],
      }),
      setEnabled,
    })}
    />)
    await waitFor(() => { expect(screen.getByText('github')).toBeTruthy() })
    expect(screen.getByText(new RegExp(`${en.stdio} · ${en.managed}`))).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: en.disable }))
    await waitFor(() => { expect(setEnabled).toHaveBeenCalledWith('github', false) })
  })

  it('opens the add editor and saves a stdio server', async () => {
    const upsert = vi.fn(async () => {})
    render(<McpSection {...props({ upsert })} />)
    await waitFor(() => { expect(screen.getByRole('button', { name: en.add })).toBeTruthy() })
    fireEvent.click(screen.getByRole('button', { name: en.add }))
    fireEvent.change(screen.getByLabelText(en.id), { target: { value: 'memory' } })
    fireEvent.change(screen.getByLabelText(en.command), { target: { value: 'mcp-server-memory' } })
    fireEvent.click(screen.getByRole('button', { name: en.save }))
    await waitFor(() => {
      expect(upsert).toHaveBeenCalledWith(expect.objectContaining({
        id: 'memory',
        serverName: 'memory',
        command: 'mcp-server-memory',
      }))
    })
  })

  it('retries after a list failure and keeps composition rows read-only', async () => {
    const list = vi.fn()
      .mockRejectedValueOnce(new Error('down'))
      .mockResolvedValueOnce({
        servers: [{
          id: 'cordis:1',
          origin: 'composition',
          writable: false,
          enabled: true,
          fiberPhase: 'failed',
          spec: { id: 'cordis:1', enabled: true, transport: 'stdio', serverName: 'memory', command: 'npx' },
        }],
      })
    render(<McpSection {...props({ list })} />)
    await waitFor(() => { expect(screen.getByText(en.error)).toBeTruthy() })
    fireEvent.click(screen.getByRole('button', { name: en.retry }))
    await waitFor(() => { expect(screen.getByText(en.readOnly)).toBeTruthy() })
    expect(screen.getByText(new RegExp(en.composition))).toBeTruthy()
  })

  it('rejects an empty command and switches the editor to HTTP', async () => {
    const upsert = vi.fn(async () => {})
    render(<McpSection {...props({ upsert })} />)
    await waitFor(() => { expect(screen.getByRole('button', { name: en.add })).toBeTruthy() })
    fireEvent.click(screen.getByRole('button', { name: en.add }))
    fireEvent.change(screen.getByLabelText(en.id), { target: { value: 'remote' } })
    fireEvent.click(screen.getByRole('button', { name: en.save }))
    await waitFor(() => { expect(screen.getByText(en.commandRequired)).toBeTruthy() })
    fireEvent.change(screen.getByLabelText(en.transport), { target: { value: 'streamable-http' } })
    fireEvent.change(screen.getByLabelText(en.url), { target: { value: 'http://127.0.0.1:9/mcp' } })
    fireEvent.click(screen.getByRole('button', { name: en.save }))
    await waitFor(() => {
      expect(upsert).toHaveBeenCalledWith(expect.objectContaining({
        id: 'remote',
        transport: 'streamable-http',
        url: 'http://127.0.0.1:9/mcp',
      }))
    })
  })

  it('asks before deleting a managed server', async () => {
    const remove = vi.fn(async () => {})
    render(<McpSection {...props({
      remove,
      list: async () => ({
        servers: [{
          id: 'github',
          origin: 'managed',
          writable: true,
          enabled: true,
          fiberPhase: 'active',
          spec: { id: 'github', enabled: true, transport: 'stdio', serverName: 'github', command: 'npx' },
        }],
      }),
    })}
    />)
    await waitFor(() => { expect(screen.getByRole('button', { name: en.remove })).toBeTruthy() })
    fireEvent.click(screen.getByRole('button', { name: en.remove }))
    fireEvent.click(screen.getByRole('button', { name: en.deleteConfirm }))
    await waitFor(() => { expect(remove).toHaveBeenCalledWith('github') })
  })
})
