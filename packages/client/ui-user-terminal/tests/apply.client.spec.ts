/** User-terminal plugin injects the drawer now and surfaces.terminal when Task 6 declares it. */
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { SlotRegistry } from '@deepseek-ai/dsh-client-runtime/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { apply, inject } from '../src/client/index.ts'
import { TerminalDrawer } from '../src/client/TerminalDrawer.tsx'
import { TerminalSurface } from '../src/client/TerminalSurface.tsx'

function declare(slots: SlotRegistry): () => void {
  return slots.register({
    name: 'root',
    children: {
      'shell.terminalDrawer': { kind: 'single', scope: 'session-maybe' },
      'surfaces.terminal': { kind: 'single', scope: 'session-maybe' },
    },
  } as never, () => null)
}

async function bench() {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  const slots = ctx.get('slots') as SlotRegistry
  const declaration = declare(slots)
  const layout = { toggleTerminalDrawer: vi.fn(), setTerminalDrawer: vi.fn() }
  ctx.provide('layout', layout)
  ctx.provide('locale', new LocaleRuntime(ctx))
  const fiber = ctx.plugin({ inject: [...inject], apply })
  await fiber.await()
  return { ctx, slots, declaration, fiber, layout }
}

describe('ui-user-terminal apply', () => {
  it('declares only the services it uses', () => {
    expect(inject).toEqual(['slots', 'layout', 'locale'])
  })

  it('injects the drawer into shell.terminalDrawer and the surface into surfaces.terminal', async () => {
    const b = await bench()
    expect(b.slots.entries('shell.terminalDrawer')[0]?.component).toBe(TerminalDrawer)
    expect(b.slots.entries('surfaces.terminal')[0]?.component).toBe(TerminalSurface)
    await b.fiber.dispose()
    expect(b.slots.entries('shell.terminalDrawer')).toHaveLength(0)
    expect(b.slots.entries('surfaces.terminal')).toHaveLength(0)
  })

  it('re-registers after the declaring slots collapse and return', async () => {
    const b = await bench()
    b.declaration()
    expect(b.slots.entries('shell.terminalDrawer')).toHaveLength(0)
    expect(b.slots.entries('surfaces.terminal')).toHaveLength(0)
    const redeclare = declare(b.slots)
    await Promise.resolve()
    expect(b.slots.entries('shell.terminalDrawer')[0]?.component).toBe(TerminalDrawer)
    expect(b.slots.entries('surfaces.terminal')[0]?.component).toBe(TerminalSurface)
    redeclare()
    await b.fiber.dispose()
  })
})
