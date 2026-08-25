/**
 * The edit entry's injected face. The target
 * 'conversation.chat.user-actions' and 'conversation.chat.user-editor' slots
 * are declared and typed by ui-conversation; this package only contributes
 * the entries, so no SlotMap merge lives here. The fork-before/open/draft/
 * submit transaction and the failure notice ride the editor inject; the
 * pencil only calls the owner `startEdit` callback. Both entries declare the
 * shared interaction store (the focus-return handshake after a cancelled
 * edit).
 * @module @deepseek-ai/dsh-client-ui-message-edit/client/slots
 */

import type {
  InjectFace, PropsLocale, PropsRuntime, PropsStore,
} from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
// Type-only: pulls this package's LocaleNamespaceMap merge (the 'messageEdit' seat).
import type {} from './locales.ts'
import type { createMessageEditStore } from './stores.ts'

/** The shared pencil/editor store share (focus-return handshake). */
type MessageEditStoreProps = PropsStore<ReturnType<typeof createMessageEditStore>>

/** Injected business face of the inline user-message editor. */
export interface MessageEditInjected {
  /**
   * Fork the source Session before the addressed message, open the child,
   * prefill the child's composer draft, and submit it.
   * @param seq - the user message to replace (the fork cuts before its turn).
   * @param text - the edited plain text, verbatim.
   */
  resend: (seq: number, text: string) => Promise<void>
  /** Publish a localized failure on the source Session's composer. */
  notify: (message: string) => void
}

/** Full props of one user-message edit action. */
export type MessageEditActionProps =
  PropsRuntime<'conversation.chat.user-actions'>
  & MessageEditStoreProps
  & PropsLocale<'messageEdit'>

/** Full props of the inline user-message editor. */
export type MessageEditEditorProps =
  PropsRuntime<'conversation.chat.user-editor'>
  & MessageEditStoreProps
  & InjectFace<MessageEditInjected>
  & PropsLocale<'messageEdit'>
