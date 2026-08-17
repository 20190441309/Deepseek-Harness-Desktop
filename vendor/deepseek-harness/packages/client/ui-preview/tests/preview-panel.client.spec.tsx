// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import type { PreviewPanelProps } from '../src/client/PreviewPanel.tsx'
import { PreviewPanel } from '../src/client/PreviewPanel.tsx'
import { en } from '../src/client/locales.ts'
import type { PreviewNavState, PreviewResult } from '../src/client/shell.ts'

const t: PreviewPanelProps['t'] = key => (en as Record<string, string>)[key] ?? key
const neverHook = (() => { throw new Error('preview must not read this hook') }) as never
const SID = 'session-preview' as SessionId

function mount(opts: {
  available?: boolean
  open?: (input: { url: string }) => Promise<PreviewResult>
  discover?: () => Promise<{ url: string; port: number }[]>
  onPreviewStateChange?: (handler: (state: PreviewNavState) => void) => () => void
} = {}) {
  const previewOpen = vi.fn(opts.open ?? (async () => ({
    ok: true,
    id: 'pv-1',
    url: 'http://127.0.0.1:3000',
    canGoBack: true,
    canGoForward: true,
  })))
  const previewNavigate = vi.fn(async () => ({ ok: true, id: 'pv-1', url: 'http://127.0.0.1:3000' }))
  const previewResize = vi.fn(async () => {})
  const previewHide = vi.fn(async () => {})
  const previewShow = vi.fn(async () => {})
  const previewDiscover = vi.fn(opts.discover ?? (async () => []))
  const openExternal = vi.fn(async () => {})
  const previewClose = vi.fn(async () => {})
  const previewBack = vi.fn(async () => ({
    ok: true, id: 'pv-1', url: 'http://127.0.0.1:3000', canGoBack: true, canGoForward: true,
  }))
  const previewForward = vi.fn(async () => ({
    ok: true, id: 'pv-1', url: 'http://127.0.0.1:3000', canGoBack: true, canGoForward: true,
  }))
  const previewReload = vi.fn(async () => ({ ok: true, id: 'pv-1', url: 'http://127.0.0.1:3000' }))
  const previewOpenDevTools = vi.fn(async () => ({ ok: true, id: 'pv-1' }))
  render(
    <PreviewPanel {...({
      sessionId: SID,
      useSession: neverHook,
      useSessions: neverHook,
      useWorkspaces: neverHook,
      useProjection: neverHook,
      active: true,
      previewAvailable: opts.available ?? true,
      previewOpen,
      previewNavigate,
      previewResize,
      previewHide,
      previewShow,
      previewClose,
      previewBack,
      previewForward,
      previewReload,
      previewState: vi.fn(async () => ({ ok: true, id: 'pv-1', url: 'http://127.0.0.1:3000' })),
      onPreviewStateChange: opts.onPreviewStateChange ?? (() => () => {}),
      previewOpenDevTools,
      previewDiscover,
      openExternal,
      t,
    } as unknown as PreviewPanelProps)} />,
  )
  return {
    previewOpen,
    previewNavigate,
    previewResize,
    previewHide,
    previewShow,
    previewClose,
    previewBack,
    previewForward,
    previewReload,
    previewOpenDevTools,
    previewDiscover,
    openExternal,
  }
}

function submitBar(): void {
  fireEvent.submit(document.querySelector('[data-preview-toolbar]') as HTMLFormElement)
}

function typeUrl(value: string): void {
  fireEvent.change(screen.getByRole('textbox', { name: 'Browser' }), { target: { value } })
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
  typeUrl('http://127.0.0.1:3000')
  submitBar()
  await waitFor(() => {
    expect(b.previewOpen).toHaveBeenCalled()
  })
  await waitFor(() => {
    expect(b.previewShow).toHaveBeenCalledWith('pv-1', expect.objectContaining({
      x: 800, y: 40, width: 400, height: 600,
    }))
  })
}

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  try {
    sessionStorage.clear()
  } catch {
    // jsdom sessionStorage may throw when locked in other tests.
  }
})

describe('PreviewPanel', () => {
  it('shows Chinese unavailable copy when preview IPC is absent', () => {
    const zhT: PreviewPanelProps['t'] = key => {
      const zh = {
        title: '\u6d4f\u89c8\u5668',
        unavailable: '\u6d4f\u89c8\u5668\u9884\u89c8\u4ec5\u5728\u684c\u9762\u5e94\u7528\u4e2d\u53ef\u7528\u3002',
      } as Record<string, string>
      return zh[key] ?? key
    }
    render(
      <PreviewPanel {...({
        sessionId: SID,
        useSession: neverHook,
        useSessions: neverHook,
        useWorkspaces: neverHook,
        useProjection: neverHook,
        active: true,
        previewAvailable: false,
        previewOpen: async () => ({ ok: false }),
        previewNavigate: async () => ({ ok: false }),
        previewResize: async () => {},
        previewHide: async () => {},
        previewShow: async () => {},
        previewClose: async () => {},
        t: zhT,
      } as unknown as PreviewPanelProps)} />,
    )
    expect(screen.getByText('\u6d4f\u89c8\u5668\u9884\u89c8\u4ec5\u5728\u684c\u9762\u5e94\u7528\u4e2d\u53ef\u7528\u3002')).toBeTruthy()
  })

  it('shows the disabled reason when preview IPC is unavailable', () => {
    mount({ available: false })
    expect(screen.getByText('Browser previews are only available in the desktop app.')).toBeTruthy()
    expect(screen.queryByRole('textbox', { name: 'Browser' })).toBeNull()
  })

  it('catches a thrown previewOpen and shows the rejected copy', async () => {
    mount({
      open: async () => { throw new Error('unknown preview id') },
    })
    typeUrl('http://127.0.0.1:3000')
    submitBar()
    expect(await screen.findByText('Preview only opens local URLs.')).toBeTruthy()
  })

  it('opens http://127.0.0.1 through previewOpen', async () => {
    const b = mount()
    typeUrl('http://127.0.0.1:4173')
    submitBar()
    await waitFor(() => {
      expect(b.previewOpen).toHaveBeenCalledWith(expect.objectContaining({
        url: 'http://127.0.0.1:4173',
      }))
    })
  })

  it('updates the address bar from guest navigation', async () => {
    let send: (state: PreviewNavState) => void = () => {}
    const b = mount({
      onPreviewStateChange: (handler) => {
        send = handler
        return () => {}
      },
    })
    await openGuest(b)
    send({
      ok: true,
      id: 'other',
      url: 'http://127.0.0.1:9',
      canGoBack: true,
      canGoForward: false,
    })
    expect((screen.getByRole('textbox', { name: 'Browser' }) as HTMLInputElement).value).toBe('http://127.0.0.1:3000')
    act(() => {
      send({
        ok: true,
        id: 'pv-1',
        url: 'http://127.0.0.1:3000/app',
        canGoBack: true,
        canGoForward: false,
      })
    })
    expect((screen.getByRole('textbox', { name: 'Browser' }) as HTMLInputElement).value).toBe('http://127.0.0.1:3000/app')
    expect((screen.getByRole('button', { name: 'Back' }) as HTMLButtonElement).disabled).toBe(false)
  })
  it('shows the rejection message when previewOpen denies a remote URL', async () => {
    mount({
      open: async () => ({ ok: false, message: 'Preview only opens local URLs.' }),
    })
    typeUrl('https://example.com')
    submitBar()
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

  it('opens a pending URL from sessionStorage and a later dshd-open-surface event', async () => {
    sessionStorage.setItem('dshd-pending-preview-url', 'http://127.0.0.1:4173')
    const b = mount()
    stubHostRect({ x: 800, y: 40, width: 400, height: 600 })
    await waitFor(() => {
      expect(b.previewOpen).toHaveBeenCalledWith(expect.objectContaining({
        url: 'http://127.0.0.1:4173',
      }))
    })
    expect(sessionStorage.getItem('dshd-pending-preview-url')).toBeNull()
    window.dispatchEvent(new CustomEvent('dshd-open-surface', { detail: { kind: 'preview' } }))
    window.dispatchEvent(new CustomEvent('dshd-open-surface', { detail: { url: 'http://127.0.0.1:3000' } }))
    await waitFor(() => {
      expect(b.previewNavigate).toHaveBeenCalledWith('pv-1', 'http://127.0.0.1:3000')
    })
  })

  it('survives a locked sessionStorage when reading the pending URL', () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('locked')
    })
    const b = mount()
    getItem.mockRestore()
    expect(b.previewOpen).not.toHaveBeenCalled()
  })

  it('opens a discovered server and keeps the chips after the guest mounts', async () => {
    const b = mount({
      discover: async () => [{ url: 'http://127.0.0.1:5173', port: 5173 }],
    })
    const chip = await screen.findByRole('button', { name: 'http://127.0.0.1:5173' })
    stubHostRect({ x: 800, y: 40, width: 400, height: 600 })
    fireEvent.click(chip)
    await waitFor(() => {
      expect(b.previewOpen).toHaveBeenCalledWith(expect.objectContaining({
        url: 'http://127.0.0.1:5173',
      }))
    })
    expect(screen.getByRole('button', { name: 'http://127.0.0.1:5173' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'http://127.0.0.1:5173' }))
    await waitFor(() => {
      expect(b.previewNavigate).toHaveBeenCalledWith('pv-1', 'http://127.0.0.1:5173')
    })
  })

  it('opens the typed URL in the system browser before a guest exists', () => {
    const b = mount()
    expect((screen.getByRole('button', { name: 'Open in system browser' }) as HTMLButtonElement).disabled).toBe(true)
    typeUrl('http://127.0.0.1:3000')
    fireEvent.click(screen.getByRole('button', { name: 'Open in system browser' }))
    expect(b.openExternal).toHaveBeenCalledWith('http://127.0.0.1:3000')
    typeUrl('   ')
    expect((screen.getByRole('button', { name: 'Open in system browser' }) as HTMLButtonElement).disabled).toBe(true)
    submitBar()
    expect(b.previewOpen).not.toHaveBeenCalled()
  })

  it('rescans loopback ports on an interval while the panel is mounted', async () => {
    vi.useFakeTimers()
    const b = mount({
      discover: async () => [{ url: 'http://127.0.0.1:4173', port: 4173 }],
    })
    await Promise.resolve()
    expect(b.previewDiscover).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(8_000)
    expect(b.previewDiscover.mock.calls.length).toBeGreaterThanOrEqual(2)
  })

  it('clears discovered chips when the scan rejects', async () => {
    const b = mount({
      discover: async () => { throw new Error('offline') },
    })
    await waitFor(() => {
      expect(b.previewDiscover).toHaveBeenCalled()
    })
    expect(screen.queryByText('Discovered local servers')).toBeNull()
  })

  it('drives back, forward, reload, and DevTools after a guest is open', async () => {
    const b = mount()
    await openGuest(b)
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    await waitFor(() => {
      expect(b.previewBack).toHaveBeenCalledWith('pv-1')
    })
    fireEvent.click(screen.getByRole('button', { name: 'Forward' }))
    await waitFor(() => {
      expect(b.previewForward).toHaveBeenCalledWith('pv-1')
    })
    fireEvent.click(screen.getByRole('button', { name: 'Reload' }))
    await waitFor(() => {
      expect(b.previewReload).toHaveBeenCalledWith('pv-1')
    })
    fireEvent.click(screen.getByRole('button', { name: 'More' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Developer tools' }))
    await waitFor(() => {
      expect(b.previewOpenDevTools).toHaveBeenCalledWith('pv-1')
    })
  })

  it('hides the guest when inactive and closes it only on unmount', async () => {
    const previewHide = vi.fn(async () => {})
    const previewShow = vi.fn(async () => {})
    const previewClose = vi.fn(async () => {})
    const previewOpen = vi.fn(async () => ({
      ok: true, id: 'pv-1', url: 'http://127.0.0.1:3000', canGoBack: true, canGoForward: true,
    }))
    const base = {
      sessionId: SID,
      useSession: neverHook,
      useSessions: neverHook,
      useWorkspaces: neverHook,
      useProjection: neverHook,
      previewAvailable: true,
      previewOpen,
      previewNavigate: vi.fn(async () => ({ ok: true, id: 'pv-1', url: 'http://127.0.0.1:3000' })),
      previewResize: vi.fn(async () => {}),
      previewHide,
      previewShow,
      previewClose,
      previewBack: vi.fn(async () => ({ ok: true })),
      previewForward: vi.fn(async () => ({ ok: true })),
      previewReload: vi.fn(async () => ({ ok: true })),
      previewState: vi.fn(async () => ({ ok: true })),
      previewOpenDevTools: vi.fn(async () => ({ ok: true })),
      previewDiscover: vi.fn(async () => []),
      openExternal: vi.fn(async () => {}),
      t,
    }
    const { rerender, unmount } = render(
      <PreviewPanel {...({ ...base, active: true } as unknown as PreviewPanelProps)} />,
    )
    stubHostRect({ x: 800, y: 40, width: 400, height: 600 })
    typeUrl('http://127.0.0.1:3000')
    submitBar()
    await waitFor(() => {
      expect(previewShow).toHaveBeenCalled()
    })
    const hideCalls = previewHide.mock.calls.length
    rerender(<PreviewPanel {...({ ...base, active: false } as unknown as PreviewPanelProps)} />)
    await waitFor(() => {
      expect(previewHide.mock.calls.length).toBeGreaterThan(hideCalls)
    })
    expect(previewClose).not.toHaveBeenCalled()
    unmount()
    await waitFor(() => {
      expect(previewClose).toHaveBeenCalledWith('pv-1')
    })
  })

  it('uses icon chrome, a search-or-URL placeholder, and Enter instead of an Open button', () => {
    mount()
    const input = screen.getByRole('textbox', { name: 'Browser' }) as HTMLInputElement
    expect(input.placeholder).toBe('Search or enter URL')
    expect(input.value).toBe('')
    expect(screen.queryByRole('button', { name: 'Open' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Back' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Forward' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Reload' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'More' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'More' }))
    expect((screen.getByRole('menuitem', { name: 'Developer tools' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('restores the committed URL on Escape and hides the guest while More is open', async () => {
    const b = mount()
    await openGuest(b)
    const input = screen.getByRole('textbox', { name: 'Browser' }) as HTMLInputElement
    fireEvent.focus(input)
    fireEvent.keyDown(input, { key: 'a' })
    typeUrl('http://127.0.0.1:9')
    expect(input.value).toBe('http://127.0.0.1:9')
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(input.value).toBe('http://127.0.0.1:3000')
    fireEvent.blur(input)
    const hideCalls = b.previewHide.mock.calls.length
    fireEvent.click(screen.getByRole('button', { name: 'More' }))
    await waitFor(() => {
      expect(b.previewHide.mock.calls.length).toBeGreaterThan(hideCalls)
    })
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('menuitem', { name: 'Developer tools' })).toBeNull()
  })

  it('keeps a focused draft when the guest navigates', async () => {
    let send: (state: PreviewNavState) => void = () => {}
    const b = mount({
      onPreviewStateChange: (handler) => {
        send = handler
        return () => {}
      },
    })
    await openGuest(b)
    const input = screen.getByRole('textbox', { name: 'Browser' }) as HTMLInputElement
    fireEvent.focus(input)
    typeUrl('http://127.0.0.1:9')
    act(() => {
      send({
        ok: true,
        id: 'pv-1',
        url: 'http://127.0.0.1:3000/app',
        canGoBack: true,
        canGoForward: false,
      })
    })
    expect(input.value).toBe('http://127.0.0.1:9')
  })
})
