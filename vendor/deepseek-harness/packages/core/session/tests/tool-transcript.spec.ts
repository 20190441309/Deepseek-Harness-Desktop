/**
 * Transcript canonicalizer: missing, duplicated, or misplaced tool results in
 * the derived history are fixed in projection so provider-bound transcripts
 * always pair every assistant tool call with exactly one in-order result.
 */

import { describe, expect, it } from 'vitest'
import { CallId, createAssistantMessage, createToolResultMessage, createUserMessage, type AssistantMessage, type Message, type ToolResultMessage, type UserMessage } from '@deepseek-ai/dsh-llm'
import {
  Session,
  SessionId,
  TOOL_NOT_STARTED_TEXT,
  TOOL_OUTCOME_UNKNOWN_TEXT,
  assertToolTranscriptValid,
  normalizeToolTranscript,
} from '@deepseek-ai/dsh-session'

function assistantWithCalls(...calls: { id: string; name: string }[]): AssistantMessage {
  return createAssistantMessage({
    content: calls.map(call => ({ type: 'tool-call', id: CallId(call.id), name: call.name, arguments: '{}' })),
    source: { provider: 'mock', model: 'mock' },
  })
}

function resultFor(callId: string, text = 'ok'): ToolResultMessage {
  return createToolResultMessage({
    callId: CallId(callId),
    content: [{ type: 'text', text }],
    isError: false,
  })
}

function user(text: string): UserMessage {
  return createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } })
}

function toolResults(messages: readonly Message[]): ToolResultMessage[] {
  return messages.filter((message): message is ToolResultMessage =>
    message.role === 'user' && message.source.kind === 'tool')
}

describe('normalizeToolTranscript', () => {
  it('passes a valid transcript through unchanged', () => {
    const messages = [user('go'), assistantWithCalls({ id: 'a', name: 'read' }), resultFor('a')]
    const normalized = normalizeToolTranscript(messages, new Set([CallId('a')]))
    expect(normalized.messages).toEqual(messages)
    expect(normalized.synthesized).toBe(0)
    expect(normalized.suppressed).toBe(0)
    expect(() => assertToolTranscriptValid(normalized.messages)).not.toThrow()
  })

  it('synthesizes results for missing pairs and closes the group before the transcript moves on', () => {
    const messages = [user('go'), assistantWithCalls({ id: 'a', name: 'read' }, { id: 'b', name: 'write' }), user('again')]
    const normalized = normalizeToolTranscript(messages, new Set([CallId('a')]))
    expect(normalized.synthesized).toBe(2)
    expect(normalized.suppressed).toBe(0)
    const [first, second, ...rest] = normalized.messages
    expect(first).toBe(messages[0])
    expect(second).toBe(messages[1])
    expect(rest).toHaveLength(3)
    // a recorded a tool/call start → outcome-unknown; b never started → not-started.
    expect(rest[0]).toMatchObject({
      role: 'user',
      source: { kind: 'tool', callId: CallId('a') },
      content: [{ type: 'tool-result', isError: true, content: [{ type: 'text', text: TOOL_OUTCOME_UNKNOWN_TEXT }] }],
    })
    expect(rest[1]).toMatchObject({
      role: 'user',
      source: { kind: 'tool', callId: CallId('b') },
      content: [{ type: 'tool-result', isError: true, content: [{ type: 'text', text: TOOL_NOT_STARTED_TEXT }] }],
    })
    expect(rest[2]).toBe(messages[2])
    expect(() => assertToolTranscriptValid(normalized.messages)).not.toThrow()
  })

  it('re-emits settled results in block order when the log misplaced them', () => {
    const messages = [assistantWithCalls({ id: 'a', name: 'read' }, { id: 'b', name: 'read' }), resultFor('b'), resultFor('a')]
    const normalized = normalizeToolTranscript(messages, new Set([CallId('a'), CallId('b')]))
    expect(normalized.messages).toEqual([
      messages[0],
      messages[2],
      messages[1],
    ])
    expect(normalized.synthesized).toBe(0)
    expect(normalized.suppressed).toBe(0)
  })

  it('suppresses duplicate results for a settled call', () => {
    const messages = [assistantWithCalls({ id: 'a', name: 'read' }), resultFor('a'), resultFor('a')]
    const normalized = normalizeToolTranscript(messages, new Set([CallId('a')]))
    expect(normalized.messages).toEqual([messages[0], messages[1]])
    expect(normalized.synthesized).toBe(0)
    expect(normalized.suppressed).toBe(1)
  })

  it('suppresses an orphan tool result with no preceding assistant call', () => {
    const messages = [resultFor('ghost')]
    const normalized = normalizeToolTranscript(messages, new Set([CallId('ghost')]))
    expect(normalized.messages).toEqual([])
    expect(normalized.suppressed).toBe(1)
  })

  it('removes malformed calls and their results while preserving valid assistant content', () => {
    const assistant = createAssistantMessage({
      content: [
        { type: 'text', text: 'checking' },
        { type: 'tool-call', id: CallId('bad'), name: '', arguments: '{}' },
        { type: 'tool-call', id: CallId('good'), name: 'read_file', arguments: '{}' },
      ],
      source: {
        provider: 'mock',
        model: 'mock',
        replayState: { response: {}, blocks: [{}, {}, {}] },
      },
    })
    const badResult = resultFor('bad')
    const goodResult = resultFor('good')
    const normalized = normalizeToolTranscript(
      [assistant, badResult, goodResult],
      new Set([CallId('bad'), CallId('good')]),
    )

    expect(normalized.repaired).toBe(1)
    expect(normalized.suppressed).toBe(1)
    expect(normalized.synthesized).toBe(0)
    expect(normalized.messages).toHaveLength(2)
    expect(normalized.messages[0]).toMatchObject({
      id: assistant.id,
      role: 'assistant',
      content: [
        { type: 'text', text: 'checking' },
        { type: 'tool-call', id: CallId('good'), name: 'read_file' },
      ],
      source: { kind: 'model', provider: 'mock', model: 'mock' },
    })
    expect(normalized.messages[0]?.source).not.toHaveProperty('replayState')
    expect(normalized.messages[1]).toBe(goodResult)
    expect(() => assertToolTranscriptValid(normalized.messages)).not.toThrow()
  })

  it('suppresses an assistant message containing only malformed calls', () => {
    const assistant = assistantWithCalls({ id: '', name: 'read' }, { id: 'bad', name: 'with space' })
    const continued = user('continue')
    const normalized = normalizeToolTranscript([assistant, resultFor('bad'), continued], new Set())
    expect(normalized.messages).toEqual([continued])
    expect(normalized.repaired).toBe(2)
    expect(normalized.suppressed).toBe(1)
  })

  it('is deterministic: repeated passes synthesize identical message identities', () => {
    const messages = [assistantWithCalls({ id: 'a', name: 'read' }), user('again')]
    const first = normalizeToolTranscript(messages, new Set([CallId('a')])).messages
    const second = normalizeToolTranscript(messages, new Set([CallId('a')])).messages
    expect(first).toEqual(second)
    expect(first[1]!.id).toBe(second[1]!.id)
  })
})

describe('assertToolTranscriptValid', () => {
  it('accepts a canonical transcript', () => {
    expect(() => assertToolTranscriptValid([
      assistantWithCalls({ id: 'a', name: 'read' }, { id: 'b', name: 'read' }),
      resultFor('a'),
      resultFor('b'),
      createAssistantMessage({ content: [{ type: 'text', text: 'done' }], source: { provider: 'mock', model: 'mock' } }),
      user('ok'),
    ])).not.toThrow()
  })

  it('rejects trailing assistant tool calls with no results', () => {
    expect(() => assertToolTranscriptValid([assistantWithCalls({ id: 'a', name: 'read' })])).toThrow(/no results/)
  })

  it('rejects malformed assistant tool-call identity', () => {
    expect(() => assertToolTranscriptValid([
      assistantWithCalls({ id: 'a', name: '' }),
      resultFor('a'),
    ])).toThrow(/malformed tool call/)
  })

  it('rejects an assistant call group that is not closed before the next message', () => {
    expect(() => assertToolTranscriptValid([
      assistantWithCalls({ id: 'a', name: 'read' }),
      user('moved on'),
    ])).toThrow(/before the transcript moves on/)
  })

  it('rejects an assistant call group that is not closed before the next assistant message', () => {
    expect(() => assertToolTranscriptValid([
      assistantWithCalls({ id: 'a', name: 'read' }),
      assistantWithCalls({ id: 'b', name: 'read' }),
    ])).toThrow(/before the next assistant message/)
  })

  it('rejects an orphan tool result', () => {
    expect(() => assertToolTranscriptValid([resultFor('ghost')])).toThrow(/no preceding assistant tool call/)
  })

  it('rejects out-of-order results', () => {
    expect(() => assertToolTranscriptValid([
      assistantWithCalls({ id: 'a', name: 'read' }, { id: 'b', name: 'read' }),
      resultFor('b'),
    ])).toThrow(/out of order/)
  })
})

describe('deriveMessages canonicalization', () => {
  it('yields a provider-valid transcript for a legacy corrupted log (the reported bug shape)', () => {
    const session = Session.create(SessionId('corrupted-legacy'))
    session.append('turn/start', { turn: 1 })
    session.append('step/start', { turn: 1, step: 1 })
    session.append('user/message', user('go'), { surfaceOp: 'append' })
    session.append('assistant/message', {
      turn: 1,
      step: 1,
      message: assistantWithCalls({ id: 'c1', name: 'read' }, { id: 'c2', name: 'write' }),
    }, { surfaceOp: 'append' })
    // c1 recorded a start; neither call ever recorded a result; the turn then
    // failed and the user sent more messages — the exact damage from the bug.
    session.append('tool/call', { turn: 1, step: 1, callId: CallId('c1'), name: 'read', arguments: '{}' })
    session.append('step/end', { turn: 1, step: 1 })
    session.append('turn/end', { turn: 1, reason: { kind: 'error', error: { message: 'boom', code: 'UNKNOWN' } } })
    session.append('turn/start', { turn: 2 })
    session.append('step/start', { turn: 2, step: 1 })
    session.append('user/message', user('again'), { surfaceOp: 'append' })

    const messages = session.deriveMessages()
    expect(() => assertToolTranscriptValid(messages)).not.toThrow()
    const results = toolResults(messages)
    expect(results.map(message => String(message.source.callId))).toEqual(['c1', 'c2'])
    expect(results[0]!.content[0]).toMatchObject({ isError: true, content: [{ type: 'text', text: TOOL_OUTCOME_UNKNOWN_TEXT }] })
    expect(results[1]!.content[0]).toMatchObject({ isError: true, content: [{ type: 'text', text: TOOL_NOT_STARTED_TEXT }] })
    const assistantIndex = messages.findIndex(
      message => message.role === 'assistant' && message.content.some(block => block.type === 'tool-call'),
    )
    expect(messages[assistantIndex + 1]).toBe(results[0])
    expect(messages[assistantIndex + 2]).toBe(results[1])
    expect(messages[assistantIndex + 3]).toMatchObject({ role: 'user', content: [{ type: 'text', text: 'again' }] })
    // The append-only log is untouched.
    expect(session.events.filter(event => event.type === 'tool/result')).toHaveLength(0)
  })

  it('repairs an empty-name poisoned session for the next prompt without rewriting its log', () => {
    const session = Session.create(SessionId('empty-name-poison'))
    const poisoned = assistantWithCalls({ id: 'bad-call', name: '' })
    session.append('user/message', user('first'), { surfaceOp: 'append' })
    session.append('assistant/message', {
      turn: 1,
      step: 1,
      message: poisoned,
    }, { surfaceOp: 'append' })
    session.append('tool/result', {
      turn: 1,
      step: 1,
      message: resultFor('bad-call', 'Error: unknown tool ""'),
    }, { surfaceOp: 'append' })
    session.append('user/message', user('try again'), { surfaceOp: 'append' })
    const before = structuredClone(session.events)

    const messages = session.deriveMessages()
    expect(messages.map(message => message.role)).toEqual(['user', 'user'])
    expect(messages[1]).toMatchObject({ content: [{ type: 'text', text: 'try again' }] })
    expect(() => assertToolTranscriptValid(messages)).not.toThrow()
    expect(session.events).toEqual(before)
  })

  it('leaves a valid session transcript byte-identical', () => {
    const session = Session.create(SessionId('valid-session'))
    session.append('turn/start', { turn: 1 })
    session.append('step/start', { turn: 1, step: 1 })
    session.append('user/message', user('go'), { surfaceOp: 'append' })
    session.append('assistant/message', {
      turn: 1,
      step: 1,
      message: assistantWithCalls({ id: 'c1', name: 'read' }),
    }, { surfaceOp: 'append' })
    session.append('tool/call', { turn: 1, step: 1, callId: CallId('c1'), name: 'read', arguments: '{}' })
    session.append('tool/result', {
      turn: 1,
      step: 1,
      message: resultFor('c1'),
    }, { surfaceOp: 'append', sourceEventSeqs: [4] })
    session.append('step/end', { turn: 1, step: 1 })
    session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })

    const messages = session.deriveMessages()
    expect(messages.map(message => message.id)).toEqual([
      messages[0]!.id, messages[1]!.id, messages[2]!.id,
    ])
    expect(messages).toHaveLength(3)
    expect(messages[1]).toMatchObject({ role: 'assistant' })
    expect(messages[2]).toMatchObject({ role: 'user', source: { kind: 'tool', callId: CallId('c1') } })
  })
})
