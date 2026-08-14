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
      previewResize={vi.fn(async () => {})}
      previewHide={vi.fn(async () => {})}
      previewShow={vi.fn(async () => {})}
      previewClose={vi.fn(async () => {})}
      t={t}
    />,
  )
  return { previewOpen, previewNavigate }
}

afterEach(cleanup)

describe('PreviewPanel', () => {
  it('shows the T3code reason when preview IPC is unavailable', () => {
    mount({ available: false })
    expect(screen.getByText('Browser previews are only available in the desktop app.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Open' })).toBeNull()
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
})
