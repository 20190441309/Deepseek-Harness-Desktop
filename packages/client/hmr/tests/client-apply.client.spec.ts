/**
 * Client-half HMR apply: the `/plugins/events` EventSource is loopback-only.
 */
import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { apply, inject } from '../src/client/index.ts'

type LocationWin = { location?: { hostname: string } }

afterEach(() => {
  delete (globalThis as LocationWin).location
  vi.unstubAllGlobals()
})

async function mount(): Promise<Context> {
  const ctx = new Context()
  ctx.provide('loader', { entries: () => [] })
  ctx.provide('modules', { invalidate() {}, prefetch() { return Promise.resolve() } })
  await ctx.plugin({ apply, inject })
  return ctx
}

describe('client-hmr browser apply', () => {
  it('opens EventSource on loopback and closes it with the fiber', async () => {
    ;(globalThis as LocationWin).location = { hostname: '127.0.0.1' }
    const close = vi.fn()
    const Source = vi.fn(function EventSource(this: { close: () => void; addEventListener: () => void }) {
      this.close = close
      this.addEventListener = vi.fn()
    })
    vi.stubGlobal('EventSource', Source)
    const ctx = await mount()
    expect(Source).toHaveBeenCalledWith('/plugins/events')
    await ctx.fiber.dispose()
    expect(close).toHaveBeenCalledOnce()
  })

  it('does not open EventSource on a relay or phone origin', async () => {
    ;(globalThis as LocationWin).location = { hostname: '125.124.85.212' }
    const Source = vi.fn()
    vi.stubGlobal('EventSource', Source)
    const ctx = await mount()
    expect(Source).not.toHaveBeenCalled()
    await ctx.fiber.dispose()
  })
})
