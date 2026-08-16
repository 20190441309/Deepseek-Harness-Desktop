/**
 * Plain-text projection of a user-message content list.
 * @module @deepseek-ai/dsh-client-ui-message-edit/client/text
 */

import type { UserActionContentBlock } from '@deepseek-ai/dsh-client-ui-conversation/client'

/**
 * Join a user message's text blocks in order.
 * @param content - frozen user-message content blocks.
 * @returns the concatenated text, or `null` when any block is not text.
 */
export function joinedText(content: readonly UserActionContentBlock[]): string | null {
  const parts: string[] = []
  for (const block of content) {
    if (block.type !== 'text') return null
    parts.push(block.text)
  }
  return parts.join('')
}
