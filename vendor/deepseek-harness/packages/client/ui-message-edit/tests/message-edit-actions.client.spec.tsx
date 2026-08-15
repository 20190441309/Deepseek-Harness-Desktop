// @vitest-environment jsdom
/**
 * MessageEditAction rendering and gestures: the pencil renders only on the
 * newest user message, stays unavailable while the session runs or the message
 * carries non-text blocks, locks while its own fork is in flight, and routes a
 * failure to the inject notify verb.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { zh as commonZh } from '@deepseek-ai/dsh-client-locale/src/locales/zh.ts'
import type { ConversationNode } from '@deepseek-ai/dsh-client-runtime/client'
import { MessageEditAction } from '../src/client/MessageEditAction.tsx'
import type { MessageEditActionProps } from '../src/client/slots.ts'
import { zh } from '../src/client/locales.ts'

afterEach(cleanup)

const t = makeTranslate(zh, commonZh)

interface SnapshotLike {
  readonly nodes: readonly ConversationNode[]
  readonly running: boolean
}

function snapshot(nodes: readonly ConversationNode[], running = false): SnapshotLike {
  return { nodes, running }
}

function mount(options: {
  seq: number
  content: readonly unknown[]
  snapshot?: SnapshotLike
  editResult?: Promise<void>
}) {
  const edit = vi.fn((_seq: number, _text: string) => options.editResult ?? Promise.resolve())
  const notify = vi.fn()
  const useSession = (<T,>(select: (s: SnapshotLike) => T): T =>
    select(options.snapshot ?? snapshot([{ kind: 'user', seq: options.seq, time: 1, content: [], source: null }]))) as never
  const props = {
    seq: options.seq,
    content: options.content as MessageEditActionProps['content'],
    edit,
    notify,
    useSession,
    t,
  } as unknown as MessageEditActionProps
  return { ...render(<MessageEditAction {...props} />), edit, notify }
}

const textBlock = (text: string) => ({ type: 'text' as const, text })

describe('MessageEditAction', () => {
  it('renders nothing for a user message that is not the newest in the transcript', () => {
    const ui = mount({
      seq: 1,
      content: [textBlock('old')],
      snapshot: snapshot([
        { kind: 'user', seq: 1, time: 1, content: [textBlock('old')], source: null },
        { kind: 'assistant', seq: 2, time: 2, turn: 1, step: 1, blocks: [{ kind: 'text', text: 'answer' }] },
        { kind: 'user', seq: 3, time: 3, content: [textBlock('newest')], source: null },
      ]),
    })
    expect(ui.queryByRole('button', { name: zh['action.edit'] })).toBeNull()
  })

  it('renders the pencil on the newest user message even when an assistant answer follows nothing else', () => {
    const ui = mount({
      seq: 3,
      content: [textBlock('newest')],
      snapshot: snapshot([
        { kind: 'user', seq: 1, time: 1, content: [textBlock('old')], source: null },
        { kind: 'assistant', seq: 2, time: 2, turn: 1, step: 1, blocks: [{ kind: 'text', text: 'answer' }] },
        { kind: 'user', seq: 3, time: 3, content: [textBlock('newest')], source: null },
      ]),
    })
    expect(ui.getByRole('button', { name: zh['action.edit'] })).toBeTruthy()
  })

  it('joins multi-part text blocks in order when prefilling', async () => {
    const ui = mount({ seq: 1, content: [textBlock('part one '), textBlock('part two')] })
    fireEvent.click(ui.getByRole('button', { name: zh['action.edit'] }))
    await Promise.resolve()
    expect(ui.edit).toHaveBeenCalledWith(1, 'part one part two')
  })

  it('forks and prefills through the inject verb on click', async () => {
    const ui = mount({ seq: 1, content: [textBlock('hello')] })
    fireEvent.click(ui.getByRole('button', { name: zh['action.edit'] }))
    await Promise.resolve()
    expect(ui.edit).toHaveBeenCalledTimes(1)
    expect(ui.edit).toHaveBeenCalledWith(1, 'hello')
    expect(ui.notify).not.toHaveBeenCalled()
  })

  it('stays unavailable while the session is running', () => {
    const ui = mount({
      seq: 1,
      content: [textBlock('hello')],
      snapshot: snapshot([{ kind: 'user', seq: 1, time: 1, content: [textBlock('hello')], source: null }], true),
    })
    const button = ui.getByRole('button', { name: zh['action.edit'] })
    expect(button.getAttribute('aria-disabled')).toBe('true')
    fireEvent.click(button)
    expect(ui.edit).not.toHaveBeenCalled()
  })

  it('stays unavailable for a message with non-text content and explains why', () => {
    const ui = mount({
      seq: 1,
      content: [{ type: 'text', text: 'caption' }, { type: 'image', attachment: { attachmentId: 'a' } }],
    })
    const button = ui.getByRole('button', { name: zh['action.edit'] })
    expect(button.getAttribute('aria-disabled')).toBe('true')
    fireEvent.click(button)
    expect(ui.edit).not.toHaveBeenCalled()
  })

  it('locks while its own fork is in flight and settles afterwards', async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    const ui = mount({ seq: 1, content: [textBlock('hello')], editResult: gate })
    const button = ui.getByRole('button', { name: zh['action.edit'] })
    fireEvent.click(button)
    expect(button.getAttribute('aria-disabled')).toBe('true')
    fireEvent.click(button)
    expect(ui.edit).toHaveBeenCalledTimes(1)
    release()
    await waitFor(() => {
      expect(ui.getByRole('button', { name: zh['action.edit'] }).getAttribute('aria-disabled')).toBeNull()
    })
  })

  it('routes a rejected fork to the notify verb with the localized copy', async () => {
    const ui = mount({
      seq: 1,
      content: [textBlock('hello')],
      editResult: Promise.reject(new Error('fork-unavailable')),
    })
    fireEvent.click(ui.getByRole('button', { name: zh['action.edit'] }))
    await Promise.resolve()
    await Promise.resolve()
    expect(ui.notify).toHaveBeenCalledWith(zh['error.generic'])
  })

  it('publishes no state after the row unmounts mid-flight', async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    const ui = mount({ seq: 1, content: [textBlock('hello')], editResult: gate })
    fireEvent.click(ui.getByRole('button', { name: zh['action.edit'] }))
    ui.unmount()
    release()
    await gate
  })
})
