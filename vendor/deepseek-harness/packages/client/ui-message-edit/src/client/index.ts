/**
 * Message edit plugin, browser half: a pencil entry in the
 * conversation.chat.user-actions strip that forks a child session cut before
 * the latest user message, opens it, and prefills the composer with the
 * original text so the human can edit and resend. The fork/open/prefill
 * transaction and the failure notice live in the inject face; the component
 * only gates visibility and availability.
 * @module @deepseek-ai/dsh-client-ui-message-edit/client
 */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: pulls the ui-conversation SlotMap merge (the user-actions entry).
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { MessageEditAction } from './MessageEditAction.tsx'
import type { MessageEditInjected } from './slots.ts'
import { en, zh } from './locales.ts'

export { MessageEditAction } from './MessageEditAction.tsx'
export type { MessageEditActionProps, MessageEditInjected } from './slots.ts'
export type { MessageEditKey } from './locales.ts'

/** Dictionary namespace owned by this plugin. */
const NS = 'messageEdit'

/** Required services: the slot registry, sessions (fork/open/scope), the conversation input face, and the copy. */
export const inject = ['slots', 'sessions', 'conversation', 'locale']

/**
 * Client plugin body: the latest-user-message edit entry.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-message-edit: dictionaries')

  ctx.slots.inject('conversation.chat.user-actions', () => ctx.slots.register({
    name: 'conversation.chat.user-actions',
    id: 'edit',
    order: 10,
    locale: NS,
    inject: (sessionId): MessageEditInjected => ({
      edit: async (seq, text) => {
        const childId = await ctx.sessions.fork({ sessionId, beforeSeq: seq, increaseTitle: true })
        ctx.sessions.open(childId)
        const scope = ctx.sessions.scope(childId)
        if (scope === undefined) throw new Error(`message edit child scope unavailable: ${childId}`)
        ctx.conversation.input.for(scope).setDraft(text)
      },
      notify: (message) => {
        const scope = ctx.sessions.scope(sessionId)
        if (scope !== undefined) ctx.conversation.input.for(scope).notify('error', message)
      },
    }),
  }, MessageEditAction))
}
