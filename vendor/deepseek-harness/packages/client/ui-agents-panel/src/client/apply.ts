/** Registers the Agents occupant into surfaces.agents. */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
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
  interface SlotMap {
    /**
     * Current-session subagent occupant. Declared by the surfaces shell; this
     * plugin injects so it attaches when that slot exists.
     */
    'surfaces.agents': { kind: 'single'; scope: 'session-maybe'; owner: Record<string, never> }
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
