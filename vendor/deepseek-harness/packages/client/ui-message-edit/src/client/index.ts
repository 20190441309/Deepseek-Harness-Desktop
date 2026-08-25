/**
 * Message edit plugin, browser half: a pencil in the latest user message's
 * action strip that turns that bubble into an inline editor. Confirm forks a
 * child session cut before the message, opens it, and submits the edited
 * text. The fork/open/draft/submit transaction and the failure notice live in
 * the editor inject face; the pencil only gates visibility and calls startEdit.
 * Both entries share one interaction store carrying the focus-return
 * handshake after a cancelled edit.
 * @module @deepseek-ai/dsh-client-ui-message-edit/client
 */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: pulls the ui-conversation SlotMap merge (user-actions / user-editor).
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { MessageEditAction } from './MessageEditAction.tsx'
import { MessageEditEditor } from './MessageEditEditor.tsx'
import { createMessageEditStore } from './stores.ts'
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
 * Client plugin body: the latest-user-message edit action and inline editor.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-message-edit: dictionaries')

  // One shared handle for both entries: the editor writes the focus-return
  // request on cancel, the pencil consumes it (one instance per session).
  const store = createMessageEditStore()

  ctx.slots.inject('conversation.chat.user-actions', () => ctx.slots.register({
    name: 'conversation.chat.user-actions',
    id: 'edit',
    order: 10,
    locale: NS,
    store,
  }, MessageEditAction))

  ctx.slots.inject('conversation.chat.user-editor', () => ctx.slots.register({
    name: 'conversation.chat.user-editor',
    locale: NS,
    store,
    inject: (sessionId): MessageEditInjected => ({
      resend: async (seq, text) => {
        const childId = await ctx.sessions.fork({ sessionId, beforeSeq: seq, increaseTitle: true })
        const scope = ctx.sessions.scope(childId)
        if (scope === undefined) throw new Error(`message edit child scope unavailable: ${childId}`)
        ctx.sessions.open(childId)
        const input = ctx.conversation.input.for(scope)
        input.setDraft(text)
        input.submit()
      },
      notify: (message) => {
        const scope = ctx.sessions.scope(sessionId)
        if (scope !== undefined) ctx.conversation.input.for(scope).notify('error', message)
      },
    }),
  }, MessageEditEditor))
}
