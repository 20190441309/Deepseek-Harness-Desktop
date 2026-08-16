import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import InvariantRegistry from '@deepseek-ai/dsh-invariants'
import * as McpServersInvariant from '../src/invariant.ts'

describe('host-mcp-servers invariant companion', () => {
  it('registers the package-owned empty installer', async () => {
    const ctx = new Context()
    await ctx.plugin(InvariantRegistry, { enabled: true })
    await expect(ctx.plugin(McpServersInvariant).await()).resolves.toBeDefined()
    await ctx.fiber.dispose()
  })
})
