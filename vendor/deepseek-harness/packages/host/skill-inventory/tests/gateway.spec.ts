import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { remoteMethods } from '@deepseek-ai/dsh-typert-protocol'
import type { SkillDefinition, SkillSummary } from '@deepseek-ai/dsh-skill'
import SkillInventoryGateway from '../src/index.ts'

const contexts: Context[] = []

afterEach(async () => {
  await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose()))
})

function summary(partial: Partial<SkillSummary> & Pick<SkillSummary, 'name'>): SkillSummary {
  return {
    description: partial.description ?? 'desc',
    invocation: partial.invocation ?? { modelInvocable: true, userInvocable: true },
    source: partial.source ?? 'user-dsh',
    provider: partial.provider ?? 'filesystem',
    ...partial,
  }
}

describe('SkillInventoryGateway', () => {
  it('publishes catalog and mutation remotes', async () => {
    const ctx = new Context()
    contexts.push(ctx)
    ctx.provide('skills', {
      list: async () => [],
      get: async () => undefined,
    } as never)
    await ctx.plugin(SkillInventoryGateway)
    const gateway = ctx.get('skillInventory') as SkillInventoryGateway
    expect(remoteMethods(gateway).map(item => item.method).sort()).toEqual([
      'create', 'get', 'list', 'remove', 'setInvocation', 'update',
    ])
  })

  it('creates a user-dsh bundle and rejects a non-kebab name', async () => {
    const home = await mkdtemp(join(tmpdir(), 'dsh-skill-inv-'))
    const previous = process.env.DSH_HOME
    process.env.DSH_HOME = home
    const ctx = new Context()
    contexts.push(ctx)
    const catalog: SkillDefinition[] = []
    ctx.provide('skills', {
      list: async () => catalog.map(item => summary(item)),
      get: async (name: string) => catalog.find(item => item.name === name),
    } as never)
    await ctx.plugin(SkillInventoryGateway)
    const gateway = ctx.get('skillInventory') as SkillInventoryGateway
    await expect(gateway.create({
      name: 'Not Valid',
      description: 'x',
      content: 'body',
      root: 'user-dsh',
    })).rejects.toThrow(/kebab-case/)
    await gateway.create({
      name: 'demo-skill',
      description: 'A demo',
      content: 'Do it',
      root: 'user-dsh',
    })
    const written = await readFile(join(home, 'skills', 'demo-skill', 'SKILL.md'), 'utf8')
    expect(written).toContain('name: demo-skill')
    expect(written).toContain('Do it')
    if (previous === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = previous
  })

  it('lists, updates, and toggles a writable skill', async () => {
    const home = await mkdtemp(join(tmpdir(), 'dsh-skill-inv-'))
    const previous = process.env.DSH_HOME
    process.env.DSH_HOME = home
    const ctx = new Context()
    contexts.push(ctx)
    const catalog: SkillDefinition[] = []
    ctx.provide('skills', {
      list: async () => catalog.map(item => summary(item)),
      get: async (name: string) => catalog.find(item => item.name === name),
    } as never)
    await ctx.plugin(SkillInventoryGateway)
    const gateway = ctx.get('skillInventory') as SkillInventoryGateway
    await gateway.create({
      name: 'demo-skill',
      description: 'A demo',
      whenToUse: 'When testing',
      content: 'Do it',
      root: 'user-dsh',
    })
    catalog.push({
      name: 'demo-skill',
      description: 'A demo',
      whenToUse: 'When testing',
      invocation: { modelInvocable: true, userInvocable: true },
      source: 'user-dsh',
      provider: 'filesystem',
      path: join(home, 'skills', 'demo-skill', 'SKILL.md'),
      content: 'Do it',
    })
    const listed = await gateway.list({})
    expect(listed.skills[0]).toMatchObject({ name: 'demo-skill', writable: true })
    const detail = await gateway.get({ name: 'demo-skill' })
    expect(detail.content).toContain('Do it')
    await gateway.update({
      name: 'demo-skill',
      description: 'Updated',
      content: 'New body',
      modelInvocable: false,
      userInvocable: false,
    })
    expect(await readFile(join(home, 'skills', 'demo-skill', 'SKILL.md'), 'utf8')).toContain('disable-model-invocation: true')
    await gateway.setInvocation({
      name: 'demo-skill',
      modelInvocable: true,
      userInvocable: false,
    })
    await gateway.delete({ name: 'demo-skill' })
    if (previous === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = previous
  })

  it('creates a project skill and refuses create without cwd', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'dsh-skill-proj-'))
    const ctx = new Context()
    contexts.push(ctx)
    ctx.provide('skills', {
      list: async () => [],
      get: async () => undefined,
    } as never)
    await ctx.plugin(SkillInventoryGateway)
    const gateway = ctx.get('skillInventory') as SkillInventoryGateway
    await expect(gateway.create({
      name: 'proj-skill',
      description: 'P',
      content: 'body',
      root: 'project-dsh',
    })).rejects.toThrow(/requires cwd/)
    await gateway.create({
      name: 'proj-skill',
      description: 'P',
      content: 'body',
      root: 'project-dsh',
      cwd,
    })
    expect(await readFile(join(cwd, '.dsh', 'skills', 'proj-skill', 'SKILL.md'), 'utf8')).toContain('name: proj-skill')
  })

  it('refuses to mutate a bundled skill', async () => {
    const ctx = new Context()
    contexts.push(ctx)
    ctx.provide('skills', {
      list: async () => [],
      get: async (name: string) => name === 'bundled-one'
        ? ({
          name: 'bundled-one',
          description: 'shipped',
          invocation: { modelInvocable: true, userInvocable: true },
          source: 'bundled',
          provider: 'filesystem',
          path: '/app/skills/bundled-one/SKILL.md',
          content: 'shipped',
        } satisfies SkillDefinition)
        : undefined,
    } as never)
    await ctx.plugin(SkillInventoryGateway)
    const gateway = ctx.get('skillInventory') as SkillInventoryGateway
    await expect(gateway.delete({ name: 'bundled-one' })).rejects.toThrow(/read-only/)
    await expect(gateway.get({ name: 'Not Valid' })).rejects.toThrow(/kebab-case/)
    await expect(gateway.get({ name: 'missing-skill' })).rejects.toThrow(/was not found/)
  })
})
