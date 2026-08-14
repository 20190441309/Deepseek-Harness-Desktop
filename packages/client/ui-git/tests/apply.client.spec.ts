/** Git plugin injects the split button into the trailing cluster at order 20. */
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { SlotRegistry } from '@deepseek-ai/dsh-client-runtime/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { apply, inject } from '../src/client/index.ts'
import { GitActionsControl } from '../src/client/GitActionsControl.tsx'

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
  ctx.provide('locale', new LocaleRuntime(ctx))
  const fiber = ctx.plugin({ inject: [...inject], apply })
  await fiber.await()
  return { ctx, slots, declaration, fiber }
}

describe('ui-git apply', () => {
  it('declares only the services it uses', () => {
    expect(inject).toEqual(['slots', 'locale'])
  })

  it('injects git actions into shell.titlebar.trailing at order 20', async () => {
    const b = await bench()
    const entry = b.slots.entries('shell.titlebar.trailing')[0]
    expect(entry?.component).toBe(GitActionsControl)
    expect(entry?.options).toMatchObject({ id: 'git-actions', order: 20 })
    await b.fiber.dispose()
    expect(b.slots.entries('shell.titlebar.trailing')).toHaveLength(0)
  })

  it('re-registers after the declaring titlebar slot collapses and returns', async () => {
    const b = await bench()
    b.declaration()
    expect(b.slots.entries('shell.titlebar.trailing')).toHaveLength(0)
    const redeclare = declare(b.slots)
    await Promise.resolve()
    expect(b.slots.entries('shell.titlebar.trailing')[0]?.component).toBe(GitActionsControl)
    expect(b.slots.entries('shell.titlebar.trailing')[0]?.options).toMatchObject({
      id: 'git-actions',
      order: 20,
    })
    redeclare()
    await b.fiber.dispose()
  })
})
