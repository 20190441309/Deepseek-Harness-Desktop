// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useSyncExternalStore } from 'react'
import type { SessionId, SessionListState } from '@deepseek-ai/dsh-client-runtime/client'
import { SessionLogDownloadController } from '../src/client/controller.ts'
import { SessionLogDownloadHeaderAction } from '../src/client/HeaderAction.tsx'
import type { SessionLogDownloadDialogProps } from '../src/client/Dialog.tsx'
import { en } from '../src/client/locales.ts'

const SID = 'session-export-header' as SessionId
const OTHER = 'session-export-other' as SessionId

function sessionList(current: SessionId | undefined): SessionListState {
  const ids = current === undefined ? [] : [current]
  const byId = current === undefined
    ? {}
    : { [current]: { id: current, displayTitle: current, running: false, blank: false, updatedAt: 1 } }
  return {
    ids,
    byId,
    current,
    phase: 'ready',
    subagentsByParent: {},
    jobsBySession: {},
    currentAddress: undefined,
  }
}

function bindSessionExport(controller: SessionLogDownloadController) {
  return function useSessionLogDownload<T>(selector: (state: ReturnType<typeof controller.store.getSnapshot>) => T): T {
    return useSyncExternalStore(
      listener => controller.store.subscribe(listener),
      () => selector(controller.store.getSnapshot()),
    )
  }
}

function useSessionsStub(list: SessionListState) {
  return <S,>(selector: (state: SessionListState) => S): S => selector(list)
}

function bench(current: SessionId | undefined) {
  const controller = new SessionLogDownloadController(async () => new Response('zip'), vi.fn())
  const request = vi.fn((sessionId: SessionId) => controller.download(sessionId))
  const dismiss = vi.fn((sessionId: SessionId) => { controller.dismiss(sessionId) })
  const useSessionLogDownload = bindSessionExport(controller)
  const list = sessionList(current)
  const props = {
    useSessions: useSessionsStub(list),
    useSessionLogDownload,
    request,
    dismiss,
    t: (key: keyof typeof en): string => en[key],
  } as unknown as SessionLogDownloadDialogProps
  const view = render(<SessionLogDownloadHeaderAction {...props} />)
  return { controller, request, view, props, list }
}

afterEach(cleanup)

describe('Session export titlebar action', () => {
  it('renders the 111×32 text capsule and downloads the current session through the shared controller', async () => {
    const b = bench(SID)
    const button = b.view.getByRole('button', { name: 'Session log' })
    expect(button.querySelector('svg')).not.toBeNull()
    expect(button.textContent).toContain('Session log')
    fireEvent.click(button)
    await waitFor(() => { expect(b.request).toHaveBeenCalledWith(SID) })
    expect(await b.view.findByRole('dialog', { name: 'Session download started' })).toBeTruthy()
  })

  it('binds the current session from useSessions on click, not a stale session id prop', async () => {
    const b = bench(SID)
    b.view.rerender(<SessionLogDownloadHeaderAction {...({
      ...b.props,
      useSessions: useSessionsStub(sessionList(OTHER)),
    } as unknown as SessionLogDownloadDialogProps)} />)
    fireEvent.click(b.view.getByRole('button', { name: 'Session log' }))
    await waitFor(() => { expect(b.request).toHaveBeenCalledWith(OTHER) })
    expect(b.request).not.toHaveBeenCalledWith(SID)
  })

  it('renders nothing when no session is current', () => {
    const b = bench(undefined)
    expect(b.view.queryByRole('button', { name: 'Session log' })).toBeNull()
  })

  it('keeps hook order legal when the current session is selected after booting with none', async () => {
    const b = bench(undefined)
    expect(b.view.queryByRole('button', { name: 'Session log' })).toBeNull()
    b.view.rerender(<SessionLogDownloadHeaderAction {...({
      ...b.props,
      useSessions: useSessionsStub(sessionList(SID)),
    } as unknown as SessionLogDownloadDialogProps)} />)
    const button = b.view.getByRole('button', { name: 'Session log' })
    fireEvent.click(button)
    await waitFor(() => { expect(b.request).toHaveBeenCalledWith(SID) })
  })

  it('keeps hook order legal when the last current session is cleared', () => {
    const b = bench(SID)
    expect(b.view.getByRole('button', { name: 'Session log' })).toBeTruthy()
    b.view.rerender(<SessionLogDownloadHeaderAction {...({
      ...b.props,
      useSessions: useSessionsStub(sessionList(undefined)),
    } as unknown as SessionLogDownloadDialogProps)} />)
    expect(b.view.queryByRole('button', { name: 'Session log' })).toBeNull()
  })

  it('disables the capsule while either entry path downloads this Session', async () => {
    const b = bench(SID)
    let release!: (response: Response) => void
    const pending = new Promise<Response>((resolve) => { release = resolve })
    const controller = new SessionLogDownloadController(() => pending, vi.fn())
    const useSessionLogDownload = bindSessionExport(controller)
    b.view.rerender(<SessionLogDownloadHeaderAction {...({
      useSessions: useSessionsStub(sessionList(SID)),
      useSessionLogDownload,
      request: (sessionId: SessionId) => controller.download(sessionId),
      dismiss: (sessionId: SessionId) => { controller.dismiss(sessionId) },
      t: (key: keyof typeof en): string => en[key],
    } as unknown as SessionLogDownloadDialogProps)} />)

    const download = controller.download(SID)
    const button = b.view.getByRole('button', { name: 'Session log' })
    await waitFor(() => { expect(button.getAttribute('aria-busy')).toBe('true') })
    expect((button as HTMLButtonElement).disabled).toBe(true)
    release(new Response('zip'))
    await download
    await waitFor(() => { expect(button.getAttribute('aria-busy')).toBe('false') })
  })

  it('keeps the accessible name and drops the visible label when density is cozy', () => {
    const b = bench(SID)
    b.view.rerender(<SessionLogDownloadHeaderAction {...({
      ...b.props,
      density: 'cozy',
    } as unknown as SessionLogDownloadDialogProps)} />)
    const button = b.view.getByRole('button', { name: 'Session log' })
    expect(button.textContent).not.toContain('Session log')
    expect(button.querySelector('svg')).not.toBeNull()
  })
})
