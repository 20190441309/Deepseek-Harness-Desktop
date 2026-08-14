// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import type { PreviewPanelProps } from '../src/client/PreviewPanel.tsx'
import { PreviewPanel } from '../src/client/PreviewPanel.tsx'
import { en } from '../src/client/locales.ts'
import type { PreviewResult } from '../src/client/shell.ts'

const t: PreviewPanelProps['t'] = key => (en as Record<string, string>)[key] ?? key
const neverHook = (() => { throw new Error('preview must not read this hook') }) as never
const SID = 'session-preview' as SessionId

function mount(opts: {
  available?: boolean
  open?: (input: { url: string }) => Promise<PreviewResult>
} = {}) {
  const previewOpen = vi.fn(opts.open ?? (async () => ({ ok: true, id: 'pv-1', url: 'http://127.0.0.1:3000' })))
  const previewNavigate = vi.fn(async () => ({ ok: true, id: 'pv-1', url: 'http://127.0.0.1:3000' }))
  const previewResize = vi.fn(async () => {})
  const previewHide = vi.fn(async () => {})
  const previewShow = vi.fn(async () => {})
  render(
    <PreviewPanel
      sessionId={SID}
      useSession={neverHook}
      useSessions={neverHook}
      useWorkspaces={neverHook}
      useProjection={neverHook}
      previewAvailable={opts.available ?? true}
      previewOpen={previewOpen}
      previewNavigate={previewNavigate}
      previewResize={previewResize}
      previewHide={previewHide}
      previewShow={previewShow}
      previewClose={vi.fn(async () => {})}
      t={t}
    />,
  )
  return { previewOpen, previewNavigate, previewResize, previewHide, previewShow }
}

function stubHostRect(rect: { x: number; y: number; width: number; height: number }): HTMLElement {
  const host = document.querySelector('[data-preview-host]') as HTMLElement
  host.getBoundingClientRect = () => ({
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
    top: rect.y,
    left: rect.x,
    right: rect.x + rect.width,
    bottom: rect.y + rect.height,
    toJSON() { return this },
  })
  return host
}

async function openGuest(b: ReturnType<typeof mount>): Promise<void> {
  stubHostRect({ x: 800, y: 40, width: 400, height: 600 })
  fireEvent.click(screen.getByRole('button', { name: 'Open' }))
  await waitFor(() => {
    expect(b.previewOpen).toHaveBeenCalled()
  })
  await waitFor(() => {
    expect(b.previewShow).toHaveBeenCalledWith('pv-1', expect.objectContaining({
      x: 800, y: 40, width: 400, height: 600,
    }))
  })
}

afterEach(cleanup)

describe('PreviewPanel', () => {
  it('shows Chinese unavailable copy when preview IPC is absent', () => {
    const zhT: PreviewPanelProps['t'] = key => {
      const zh = {
        title: '浏览器',
        unavailable: '浏览器预览仅在桌面应用中可用。',
      } as Record<string, string>
      return zh[key] ?? key
    }
    render(
      <PreviewPanel
        sessionId={SID}
        useSession={neverHook}
        useSessions={neverHook}
        useWorkspaces={neverHook}
        useProjection={neverHook}
        previewAvailable={false}
        previewOpen={async () => ({ ok: false })}
        previewNavigate={async () => ({ ok: false })}
        previewResize={async () => {}}
        previewHide={async () => {}}
        previewShow={async () => {}}
        previewClose={async () => {}}
        t={zhT}
      />,
    )
    expect(screen.getByText('浏览器预览仅在桌面应用中可用。')).toBeTruthy()
  })

  it('shows the T3code reason when preview IPC is unavailable', () => {
    mount({ available: false })
    expect(screen.getByText('Browser previews are only available in the desktop app.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Open' })).toBeNull()
  })

  it('catches a thrown previewOpen and shows the rejected copy', async () => {
    mount({
      open: async () => { throw new Error('unknown preview id') },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Open' }))
    expect(await screen.findByText('Preview only opens local URLs.')).toBeTruthy()
  })

  it('opens http://127.0.0.1 through previewOpen', async () => {
    const b = mount()
    const input = screen.getByRole('textbox', { name: 'Browser' })
    fireEvent.change(input, { target: { value: 'http://127.0.0.1:4173' } })
    fireEvent.click(screen.getByRole('button', { name: 'Open' }))
    await waitFor(() => {
      expect(b.previewOpen).toHaveBeenCalledWith(expect.objectContaining({
        url: 'http://127.0.0.1:4173',
      }))
    })
  })

  it('shows the rejection message when previewOpen denies a remote URL', async () => {
    mount({
      open: async () => ({ ok: false, message: 'Preview only opens local URLs.' }),
    })
    fireEvent.change(screen.getByRole('textbox', { name: 'Browser' }), {
      target: { value: 'https://example.com' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Open' }))
    await waitFor(() => {
      expect(screen.getByText('Preview only opens local URLs.')).toBeTruthy()
    })
  })

  it('hides the guest when the host rect is empty and shows it when the host is non-zero again', async () => {
    const b = mount()
    await openGuest(b)

    stubHostRect({ x: 800, y: 40, width: 0, height: 600 })
    fireEvent(window, new Event('resize'))
    await waitFor(() => {
      expect(b.previewHide).toHaveBeenCalledWith('pv-1')
    })

    stubHostRect({ x: 800, y: 40, width: 400, height: 600 })
    fireEvent(window, new Event('resize'))
    await waitFor(() => {
      expect(b.previewShow).toHaveBeenCalledTimes(2)
      expect(b.previewShow).toHaveBeenLastCalledWith('pv-1', expect.objectContaining({
        x: 800, y: 40, width: 400, height: 600,
      }))
    })
  })

  it('pushes a new origin through previewResize when the window resizes', async () => {
    const b = mount()
    await openGuest(b)

    stubHostRect({ x: 520, y: 40, width: 400, height: 600 })
    fireEvent(window, new Event('resize'))
    await waitFor(() => {
      expect(b.previewResize).toHaveBeenCalledWith('pv-1', expect.objectContaining({
        x: 520, y: 40, width: 400, height: 600,
      }))
    })
  })
})
