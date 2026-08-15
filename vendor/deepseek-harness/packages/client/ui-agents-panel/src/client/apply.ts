/** Registers the Agents occupant into surfaces.agents. */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-surfaces/client'
import { AgentsPanel } from './AgentsPanel.tsx'
import { en, NS, zh, type AgentsKey } from './locales.ts'

export type { AgentsPanelProps } from './AgentsPanel.tsx'
export type { AgentRow } from './agents.ts'
export type { AgentsKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Agents surface copy. */
    agents: AgentsKey
  }
}

/** Services required by the agents-panel plugin. */
export const inject = ['slots', 'locale']

/**
 * Register dictionaries and inject the Agents occupant.
 * @param ctx - Client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-agents-panel: dictionaries')

  ctx.slots.inject('surfaces.agents', () => ctx.slots.register({
    name: 'surfaces.agents',
    locale: NS,
  }, AgentsPanel))
}
