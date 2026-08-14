/** Titlebar plugin injects panel toggles into the trailing cluster at order 40. */
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { SlotRegistry } from '@deepseek-ai/dsh-client-runtime/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { apply, inject } from '../src/client/index.ts'
import type { PanelTogglesInjected } from '../src/client/PanelToggles.tsx'
import { PanelToggles } from '../src/client/PanelToggles.tsx'

function declare(slots: SlotRegistry): () => void {
  return slots.register({
    name: 'root',
    children: {
      'shell.titlebar.trailing': { kind: 'list', scope: 'root' },
    },
  } as never, () => null)
}

async function bench() {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  const slots = ctx.get('slots') as SlotRegistry
  const declaration = declare(slots)
  const layout = { toggleSurfaces: vi.fn(), toggleTerminalDrawer: vi.fn() }
  ctx.provide('layout', layout)
  ctx.provide('locale', new LocaleRuntime(ctx))
  const fiber = ctx.plugin({ inject: [...inject], apply })
  await fiber.await()
  return { ctx, slots, declaration, fiber, layout }
}

describe('ui-titlebar apply', () => {
  it('declares only the services it uses', () => {
    expect(inject).toEqual(['slots', 'layout', 'locale'])
  })

  it('injects panel toggles into shell.titlebar.trailing at order 40', async () => {
    const b = await bench()
    const entry = b.slots.entries('shell.titlebar.trailing')[0]
    expect(entry?.component).toBe(PanelToggles)
    expect(entry?.options).toMatchObject({ id: 'panel-toggles', order: 40 })
    const injected = (entry?.inject as () => PanelTogglesInjected)()
    injected.toggleTerminalDrawer()
    injected.toggleSurfaces()
    expect(b.layout.toggleTerminalDrawer).toHaveBeenCalledOnce()
    expect(b.layout.toggleSurfaces).toHaveBeenCalledOnce()
    await b.fiber.dispose()
    expect(b.slots.entries('shell.titlebar.trailing')).toHaveLength(0)
  })

  it('re-registers after the declaring titlebar slot collapses and returns', async () => {
    const b = await bench()
    b.declaration()
    expect(b.slots.entries('shell.titlebar.trailing')).toHaveLength(0)
    const redeclare = declare(b.slots)
    await Promise.resolve()
    expect(b.slots.entries('shell.titlebar.trailing')[0]?.component).toBe(PanelToggles)
    expect(b.slots.entries('shell.titlebar.trailing')[0]?.options).toMatchObject({
      id: 'panel-toggles',
      order: 40,
    })
    redeclare()
    await b.fiber.dispose()
  })
})
