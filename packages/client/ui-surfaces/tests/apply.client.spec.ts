/** Surfaces plugin occupies the layout surfaces column and declares five children. */
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { SlotRegistry } from '@deepseek-ai/dsh-client-runtime/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { apply, inject } from '../src/client/index.ts'
import type { SurfacesRootInjected } from '../src/client/SurfacesRoot.tsx'
import { SurfacesRoot } from '../src/client/SurfacesRoot.tsx'

function declare(slots: SlotRegistry): () => void {
  return slots.register({
    name: 'root',
    children: {
      surfaces: { kind: 'single', scope: 'session-maybe' },
    },
  } as never, () => null)
}

async function bench() {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  const slots = ctx.get('slots') as SlotRegistry
  const declaration = declare(slots)
  const layout = { openSurfaces: vi.fn() }
  ctx.provide('layout', layout)
  ctx.provide('locale', new LocaleRuntime(ctx))
  const fiber = ctx.plugin({ inject: [...inject], apply })
  await fiber.await()
  return { ctx, slots, declaration, fiber, layout }
}

describe('ui-surfaces apply', () => {
  it('declares only the services it uses', () => {
    expect(inject).toEqual(['slots', 'layout', 'locale'])
  })

  it('occupies surfaces and declares six single session-maybe children', async () => {
    const b = await bench()
    const entry = b.slots.entries('surfaces')[0]
    expect(entry?.component).toBe(SurfacesRoot)
    expect(entry?.children).toEqual({
      'surfaces.browser': { kind: 'single', scope: 'session-maybe' },
      'surfaces.terminal': { kind: 'single', scope: 'session-maybe' },
      'surfaces.files': { kind: 'single', scope: 'session-maybe' },
      'surfaces.file': { kind: 'single', scope: 'session-maybe' },
      'surfaces.diff': { kind: 'single', scope: 'session-maybe' },
      'surfaces.agents': { kind: 'single', scope: 'session-maybe' },
    })
    const occupant = (): null => null
    const attached = b.slots.register({ name: 'surfaces.terminal' } as never, occupant)
    expect(b.slots.entries('surfaces.terminal')[0]?.component).toBe(occupant)
    attached()
    const injected = (entry?.inject as unknown as () => SurfacesRootInjected)()
    injected.openSurfaces()
    expect(b.layout.openSurfaces).toHaveBeenCalledOnce()
    await b.fiber.dispose()
    expect(b.slots.entries('surfaces')).toHaveLength(0)
  })

  it('re-registers after the declaring surfaces slot collapses and returns', async () => {
    const b = await bench()
    b.declaration()
    expect(b.slots.entries('surfaces')).toHaveLength(0)
    const redeclare = declare(b.slots)
    await Promise.resolve()
    expect(b.slots.entries('surfaces')[0]?.component).toBe(SurfacesRoot)
    expect(b.slots.entries('surfaces')[0]?.children?.['surfaces.terminal']).toEqual({
      kind: 'single', scope: 'session-maybe',
    })
    redeclare()
    await b.fiber.dispose()
  })
})
