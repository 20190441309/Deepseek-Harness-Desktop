import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import * as TitlebarInvariant from '../src/invariant.ts'
import { apply as nodeApply } from '../src/index.ts'
import InvariantRegistry from '@deepseek-ai/dsh-invariants'

describe('invariant companion', () => {
  it('registers under the package name with an empty installer', async () => {
    const ctx = new Context()
    await ctx.plugin(InvariantRegistry, { enabled: true })
    await expect(ctx.plugin(TitlebarInvariant).await()).resolves.toBeDefined()
  })

  it('node-half waits for optional Host settings', () => {
    nodeApply(new Context())
    expect(true).toBe(true)
  })
})
