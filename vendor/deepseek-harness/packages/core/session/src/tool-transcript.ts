/**
 * Transcript canonicalizer: every assistant tool call in the derived LLM
 * history is paired with exactly one in-order tool result before the
 * transcript moves on. The append-only log is never rewritten — missing
 * results are synthesized as deterministic error tool messages in the
 * projection only, so a legacy or corrupted log still yields a
 * provider-valid transcript (OpenAI-compatible providers reject an assistant
 * message whose tool_calls lack following tool messages).
 *
 * @module @deepseek-ai/dsh-session/tool-transcript
 */

import { MessageId, freezeMessage, type CallId, type Message, type ToolCallBlock, type ToolResultMessage } from '@deepseek-ai/dsh-llm'
import { TOOL_NOT_STARTED_TEXT, TOOL_OUTCOME_UNKNOWN_TEXT } from './repair.ts'

/** Outcome of one transcript canonicalization pass. */
export interface ToolTranscriptNormalization {
  /** The provider-valid transcript (existing messages by reference, synthesized results new). */
  messages: Message[]
  /** Number of synthesized deterministic error results. */
  synthesized: number
  /** Number of suppressed duplicate or orphan tool results. */
  suppressed: number
}

/**
 * Canonicalize a derived transcript so assistant tool calls are fully paired.
 *
 * Within each assistant message's tool-call group, settled results are
 * re-emitted in block order; missing results are synthesized as deterministic
 * error tool messages (outcome-unknown when a durable `tool/call` start was
 * recorded, not-started otherwise). A tool result that does not belong to the
 * open group (a duplicate or an orphan with no preceding assistant call) is
 * dropped: emitting it would be as provider-invalid as a missing result.
 * A valid transcript passes through unchanged (`synthesized` and `suppressed`
 * are both zero).
 *
 * @param messages - the surface-projected transcript.
 * @param startedCalls - call ids that durably recorded a `tool/call` start.
 * @returns the canonical transcript and its synthesis/suppression counts.
 */
export function normalizeToolTranscript(
  messages: readonly Message[],
  startedCalls: ReadonlySet<CallId>,
): ToolTranscriptNormalization {
  const out: Message[] = []
  let synthesized = 0
  let suppressed = 0
  let pendingBlocks: ToolCallBlock[] = []
  let remainingIds = new Set<CallId>()
  const settled = new Map<CallId, Message>()

  const closeGroup = (): void => {
    if (pendingBlocks.length === 0) return
    for (const block of pendingBlocks) {
      const result = settled.get(block.id)
      if (result !== undefined) {
        out.push(result)
      } else {
        out.push(synthesizedResult(block.id, startedCalls.has(block.id)))
        synthesized++
      }
    }
    pendingBlocks = []
    remainingIds = new Set()
    settled.clear()
  }

  for (const message of messages) {
    const toolCalls = message.role === 'assistant'
      ? message.content.filter((block): block is ToolCallBlock => block.type === 'tool-call')
      : []
    if (toolCalls.length > 0) {
      closeGroup()
      pendingBlocks = toolCalls
      remainingIds = new Set(toolCalls.map(block => block.id))
      out.push(message)
      continue
    }
    if (message.role === 'user' && message.source.kind === 'tool') {
      if (remainingIds.has(message.source.callId)) {
        /* v8 ignore next -- settled and remainingIds are updated together, so a
           result whose id is still pending can never already be settled */
        if (settled.has(message.source.callId)) {
          suppressed++
        } else {
          settled.set(message.source.callId, message)
          remainingIds.delete(message.source.callId)
        }
      } else {
        // Duplicate for a closed group or an orphan result: drop it.
        suppressed++
      }
      continue
    }
    // Any other message while calls are pending: the assistant's calls were
    // never answered before the transcript moved on — close them first.
    closeGroup()
    out.push(message)
  }
  closeGroup()
  return { messages: out, synthesized, suppressed }
}

/**
 * Provider-validity gate over a transcript that must already be canonical.
 * Fails loud (instead of sending a known-invalid payload) when an assistant
 * tool call lacks exactly one in-order result, or a tool result has no
 * preceding assistant tool call.
 * @param messages - the transcript about to reach a provider.
 */
export function assertToolTranscriptValid(messages: readonly Message[]): void {
  let pending: ToolCallBlock[] = []
  for (const message of messages) {
    if (message.role === 'assistant') {
      const calls = message.content.filter((block): block is ToolCallBlock => block.type === 'tool-call')
      if (calls.length > 0) {
        if (pending.length > 0) {
          throw new Error('session transcript: assistant tool calls are not followed by their results before the next assistant message')
        }
        pending = calls
      }
      continue
    }
    if (message.role === 'user' && message.source.kind === 'tool') {
      const callId = message.source.callId
      const index = pending.findIndex(block => block.id === callId)
      if (index === -1) {
        throw new Error(`session transcript: tool result for "${String(callId)}" has no preceding assistant tool call`)
      }
      if (index !== 0) {
        throw new Error(`session transcript: tool result for "${String(callId)}" is out of order relative to its assistant tool calls`)
      }
      pending = pending.slice(1)
      continue
    }
    if (pending.length > 0) {
      throw new Error('session transcript: assistant tool calls are not followed by their results before the transcript moves on')
    }
  }
  if (pending.length > 0) {
    throw new Error('session transcript: trailing assistant tool calls have no results')
  }
}

/** Build one deterministic frozen error result for a missing pair. */
function synthesizedResult(callId: CallId, started: boolean): ToolResultMessage {
  return freezeMessage({
    id: MessageId(`canonical-tool-result-${callId}`),
    role: 'user',
    source: { kind: 'tool', callId },
    content: [{
      type: 'tool-result',
      toolCallId: callId,
      isError: true,
      content: [{
        type: 'text',
        text: started ? TOOL_OUTCOME_UNKNOWN_TEXT : TOOL_NOT_STARTED_TEXT,
      }],
    }],
  })
}
