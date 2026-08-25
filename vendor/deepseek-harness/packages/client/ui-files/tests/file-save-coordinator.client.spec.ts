import { afterEach, describe, expect, it, vi } from 'vitest'
import { FileSaveCoordinator } from '../src/client/fileSaveCoordinator.ts'

function deferred() {
  let resolve!: (result: { ok: boolean }) => void
  const promise = new Promise<{ ok: boolean }>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

describe('FileSaveCoordinator', () => {
  afterEach(() => { vi.useRealTimers() })

  it('debounces edits and persists only the latest contents', async () => {
    vi.useFakeTimers()
    const persist = vi.fn<(contents: string) => Promise<{ ok: boolean }>>()
      .mockResolvedValue({ ok: true })
    const onPendingChange = vi.fn()
    const onConfirmed = vi.fn()
    const coordinator = new FileSaveCoordinator({
      debounceMs: 500, persist, onPendingChange, onConfirmed,
    })
    coordinator.change('first')
    await vi.advanceTimersByTimeAsync(300)
    coordinator.change('latest')
    await vi.advanceTimersByTimeAsync(499)
    expect(persist).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(persist).toHaveBeenCalledOnce()
    expect(persist).toHaveBeenCalledWith('latest')
    expect(onConfirmed).toHaveBeenCalledWith('latest')
    expect(onPendingChange.mock.calls).toEqual([[true], [true], [false]])
  })

  it('keeps pending state until an edit made during a write is also saved', async () => {
    vi.useFakeTimers()
    const firstWrite = deferred()
    const persist = vi.fn<(contents: string) => Promise<{ ok: boolean }>>()
      .mockReturnValueOnce(firstWrite.promise)
      .mockResolvedValueOnce({ ok: true })
    const onPendingChange = vi.fn()
    const coordinator = new FileSaveCoordinator({
      debounceMs: 500, persist, onPendingChange, onConfirmed: vi.fn(),
    })
    coordinator.change('first')
    await vi.advanceTimersByTimeAsync(500)
    coordinator.change('latest')
    await vi.advanceTimersByTimeAsync(500)
    expect(persist).toHaveBeenCalledTimes(1)
    firstWrite.resolve({ ok: true })
    await vi.runAllTimersAsync()
    expect(persist).toHaveBeenCalledTimes(2)
    expect(persist).toHaveBeenLastCalledWith('latest')
    expect(onPendingChange.mock.calls.at(-1)).toEqual([false])
  })

  it('flush waits out an in-flight debounced write before persisting', async () => {
    vi.useFakeTimers()
    const firstWrite = deferred()
    const persist = vi.fn<(contents: string) => Promise<{ ok: boolean }>>()
      .mockReturnValueOnce(firstWrite.promise)
      .mockResolvedValue({ ok: true })
    const onConfirmed = vi.fn()
    const coordinator = new FileSaveCoordinator({
      debounceMs: 500, persist, onPendingChange: vi.fn(), onConfirmed,
    })
    coordinator.change('debounced')
    await vi.advanceTimersByTimeAsync(500)
    expect(persist).toHaveBeenCalledTimes(1)
    const flushed = coordinator.flush('explicit')
    // The explicit save must not start a second write while one is in flight.
    await vi.advanceTimersByTimeAsync(0)
    expect(persist).toHaveBeenCalledTimes(1)
    firstWrite.resolve({ ok: true })
    const result = await flushed
    expect(result.ok).toBe(true)
    expect(persist).toHaveBeenCalledTimes(2)
    expect(persist).toHaveBeenLastCalledWith('explicit')
    expect(onConfirmed).toHaveBeenLastCalledWith('explicit')
    // The rescheduled debounce was cancelled by flush: no third write.
    await vi.runAllTimersAsync()
    expect(persist).toHaveBeenCalledTimes(2)
  })

  it('flush cancels the pending debounce and persists immediately', async () => {
    vi.useFakeTimers()
    const persist = vi.fn<(contents: string) => Promise<{ ok: boolean }>>()
      .mockResolvedValue({ ok: true })
    const onPendingChange = vi.fn()
    const coordinator = new FileSaveCoordinator({
      debounceMs: 500, persist, onPendingChange, onConfirmed: vi.fn(),
    })
    coordinator.change('typed')
    const result = await coordinator.flush('typed more')
    expect(result.ok).toBe(true)
    expect(persist).toHaveBeenCalledOnce()
    expect(persist).toHaveBeenCalledWith('typed more')
    expect(onPendingChange.mock.calls.at(-1)).toEqual([false])
    await vi.runAllTimersAsync()
    expect(persist).toHaveBeenCalledOnce()
  })

  it('flush reports a failed write and keeps the file pending', async () => {
    vi.useFakeTimers()
    const onPendingChange = vi.fn()
    const coordinator = new FileSaveCoordinator({
      debounceMs: 500,
      persist: vi.fn().mockResolvedValue({ ok: false }),
      onPendingChange,
      onConfirmed: vi.fn(),
    })
    const result = await coordinator.flush('unsaved')
    expect(result.ok).toBe(false)
    expect(onPendingChange).toHaveBeenCalledWith(true)
    expect(onPendingChange).not.toHaveBeenCalledWith(false)
  })

  it('leaves the file pending when the latest write fails', async () => {
    vi.useFakeTimers()
    const onPendingChange = vi.fn()
    const coordinator = new FileSaveCoordinator({
      debounceMs: 500,
      persist: vi.fn().mockResolvedValue({ ok: false }),
      onPendingChange,
      onConfirmed: vi.fn(),
    })
    coordinator.change('latest')
    await vi.advanceTimersByTimeAsync(500)
    await Promise.resolve()
    expect(onPendingChange).toHaveBeenCalledWith(true)
    expect(onPendingChange).not.toHaveBeenCalledWith(false)
  })
})
