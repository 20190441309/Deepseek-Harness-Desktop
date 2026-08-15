/**
 * The edit entry's injected face. The target
 * 'conversation.chat.user-actions' slot is declared and typed by
 * ui-conversation; this package only contributes the entry, so no SlotMap
 * merge lives here. The two verbs ride the inject: the fork-before/open/
 * prefill transaction, and a localized failure notice for the source Session.
 * @module @deepseek-ai/dsh-client-ui-message-edit/client/slots
 */

import type {
  InjectFace, PropsLocale, PropsRuntime,
} from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
// Type-only: pulls this package's LocaleNamespaceMap merge (the 'messageEdit' seat).
import type {} from './locales.ts'

/** Injected business face of one user-message edit entry. */
export interface MessageEditInjected {
  /**
   * Fork the source Session before the addressed message, open the child, and
   * prefill the child's composer draft with the original text.
   * @param seq - the user message to edit (the fork cuts before its turn).
   * @param text - the message's plain text, verbatim.
   */
  edit: (seq: number, text: string) => Promise<void>
  /** Publish a localized failure on the source Session's composer. */
  notify: (message: string) => void
}

/** Full props of one user-message edit entry. */
export type MessageEditActionProps =
  PropsRuntime<'conversation.chat.user-actions'>
  & InjectFace<MessageEditInjected>
  & PropsLocale<'messageEdit'>
