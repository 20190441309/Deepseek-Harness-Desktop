/**
 * Skills settings section plugin, browser half.
 */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import { SkillsSection } from './SkillsSection.tsx'
import type { SkillsSectionInjected } from './SkillsSection.tsx'
import { en, zh, type SkillsSettingsKey } from './locales.ts'

export type { SkillsSectionInjected, SkillsSectionProps } from './SkillsSection.tsx'
export type { SkillsSettingsKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Skills settings copy. */
    'settings.skills': SkillsSettingsKey
  }
}

/** Dictionary namespace. */
export const NS = 'settings.skills'

/** Required services. */
export const inject = ['slots', 'locale', 'remote', 'remote.skillInventory', 'sessions']

/**
 * Register the Skills settings section.
 * @param ctx - client root.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-settings-skills: dictionaries')
  const t = ctx.locale.bind(NS) as SkillsSectionInjected['t']
  const injected = (): SkillsSectionInjected => ({
    t,
    getCwd: () => {
      const list = ctx.sessions.list.getSnapshot()
      const current = list.current
      return current === undefined ? undefined : list.byId[current]?.cwd
    },
    list: async cwd => unwrap(await ctx.remote.skillInventory.list(scope(cwd)), 'skillInventory.list'),
    get: async (name, cwd) => unwrap(await ctx.remote.skillInventory.get({ name, ...scope(cwd) }), 'skillInventory.get'),
    create: async input => {
      unwrap(await ctx.remote.skillInventory.create({ ...input, root: 'user-dsh' }), 'skillInventory.create')
    },
    update: async input => { unwrap(await ctx.remote.skillInventory.update({ ...input, ...scope(input.cwd) }), 'skillInventory.update') },
    remove: async (name, cwd) => { unwrap(await ctx.remote.skillInventory.delete({ name, ...scope(cwd) }), 'skillInventory.delete') },
    setInvocation: async (name, modelInvocable, userInvocable, cwd) => {
      unwrap(await ctx.remote.skillInventory.setInvocation({ name, modelInvocable, userInvocable, ...scope(cwd) }), 'skillInventory.setInvocation')
    },
  })
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'skills',
    order: 20,
    label: () => t('nav'),
    locale: NS,
    inject: injected,
  }, SkillsSection))
}

function unwrap<T>(result: { ok: true, value: T } | { ok: false, error: { code: string, message: string } }, label: string): T {
  if (!result.ok) throw new Error(`${label} failed: ${result.error.code}: ${result.error.message}`)
  return result.value
}

function scope(cwd: string | undefined): { cwd: string } | object {
  return cwd === undefined || cwd.trim().length === 0 ? {} : { cwd }
}
