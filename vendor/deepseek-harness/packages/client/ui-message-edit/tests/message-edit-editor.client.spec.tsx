// @vitest-environment jsdom
/**
 * MessageEditEditor: the bubble-replacement textarea prefills joined text,
 * cancel restores the owner and requests focus return, send runs the inject
 * resend verb with the draft, empty drafts cannot send, a running or stale
 * session blocks send with the reason announced, and a rejected resend keeps
 * the editor armed with the draft for retry.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { zh as commonZh } from '@deepseek-ai/dsh-client-locale/src/locales/zh.ts'
import { MessageEditEditor } from '../src/client/MessageEditEditor.tsx'
import { createMessageEditStore } from '../src/client/stores.ts'
import type { MessageEditEditorProps } from '../src/client/slots.ts'
import { zh } from '../src/client/locales.ts'

/** Live ResizeObserver callbacks, newest last (jsdom ships no implementation). */
let resizeCallbacks: ResizeObserverCallback[] = []

beforeEach(() => {
  resizeCallbacks = []
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback: ResizeObserverCallback) { resizeCallbacks.push(callback) }
    observe(): void {}
    disconnect(): void {}
  })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

const t = makeTranslate(zh, commonZh)

interface SnapshotLike {
  readonly nodes: readonly { kind: string; seq: number }[]
  readonly running: boolean
}

function mount(options: {
  seq?: number
  content: readonly unknown[]
  resendResult?: Promise<void>
  snapshot?: SnapshotLike
}) {
  const seq = options.seq ?? 7
  const resend = vi.fn((_seq: number, _text: string) => options.resendResult ?? Promise.resolve())
  const notify = vi.fn()
  const cancelEdit = vi.fn()
  const store = createMessageEditStore().create()
  const snapshot = options.snapshot ?? { nodes: [{ kind: 'user', seq }], running: false }
  const useSession = (<T,>(select: (s: SnapshotLike) => T): T => select(snapshot)) as never
  const props = {
    seq,
    content: options.content as MessageEditEditorProps['content'],
    cancelEdit,
    resend,
    notify,
    useSession,
    actions: store.actions,
    t,
  } as unknown as MessageEditEditorProps
  return { ...render(<MessageEditEditor {...props} />), resend, notify, cancelEdit, store }
}

const textBlock = (text: string) => ({ type: 'text' as const, text })
const field = (ui: ReturnType<typeof mount>) =>
  ui.getByRole('textbox', { name: zh['editor.field'] }) as HTMLTextAreaElement

describe('MessageEditEditor', () => {
  it('prefills joined text blocks and focuses the field', () => {
    const ui = mount({ content: [textBlock('part one '), textBlock('part two')] })
    expect(field(ui).value).toBe('part one part two')
    expect(document.activeElement).toBe(field(ui))
  })

  it('opens empty when the message is not plain text', () => {
    const ui = mount({
      content: [{ type: 'text', text: 'caption' }, { type: 'image', attachment: { attachmentId: 'a' } }],
    })
    expect(field(ui).value).toBe('')
    expect((ui.getByRole('button', { name: zh['action.send'] }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('restores the bubble through cancelEdit and requests focus return', () => {
    const ui = mount({ content: [textBlock('hello')] })
    fireEvent.click(ui.getByRole('button', { name: zh['action.cancel'] }))
    expect(ui.cancelEdit).toHaveBeenCalledTimes(1)
    expect(ui.resend).not.toHaveBeenCalled()
    expect(ui.store.getSnapshot().returnFocusSeq).toBe(7)
  })

  it('restores the bubble on Escape', () => {
    const ui = mount({ content: [textBlock('hello')] })
    fireEvent.keyDown(field(ui), { key: 'Escape' })
    expect(ui.cancelEdit).toHaveBeenCalledTimes(1)
    expect(ui.store.getSnapshot().returnFocusSeq).toBe(7)
  })

  it('does not cancel on an IME composition Escape', () => {
    const ui = mount({ content: [textBlock('hello')] })
    fireEvent.compositionStart(field(ui))
    fireEvent.keyDown(field(ui), { key: 'Escape' })
    expect(ui.cancelEdit).not.toHaveBeenCalled()
    fireEvent.keyDown(field(ui), { key: 'Escape', isComposing: true })
    expect(ui.cancelEdit).not.toHaveBeenCalled()
  })

  it('sends the edited draft through resend and not the original text', async () => {
    const ui = mount({ seq: 7, content: [textBlock('hello')] })
    fireEvent.change(field(ui), { target: { value: 'revised' } })
    fireEvent.click(ui.getByRole('button', { name: zh['action.send'] }))
    await Promise.resolve()
    expect(ui.resend).toHaveBeenCalledWith(7, 'revised')
    expect(ui.notify).not.toHaveBeenCalled()
    expect(ui.cancelEdit).not.toHaveBeenCalled()
  })

  it('sends on Enter and inserts a newline on Shift+Enter', async () => {
    const ui = mount({ content: [textBlock('hello')] })
    fireEvent.keyDown(field(ui), { key: 'Enter', shiftKey: true })
    expect(ui.resend).not.toHaveBeenCalled()
    fireEvent.keyDown(field(ui), { key: 'Enter', repeat: true })
    expect(ui.resend).not.toHaveBeenCalled()
    fireEvent.keyDown(field(ui), { key: 'Enter', isComposing: true })
    expect(ui.resend).not.toHaveBeenCalled()
    fireEvent.keyDown(field(ui), { key: 'Enter', keyCode: 229 })
    expect(ui.resend).not.toHaveBeenCalled()
    fireEvent.compositionStart(field(ui))
    fireEvent.keyDown(field(ui), { key: 'Enter' })
    expect(ui.resend).not.toHaveBeenCalled()
  })

  it('sends a non-composing Enter', async () => {
    const ui = mount({ content: [textBlock('hello')] })
    fireEvent.keyDown(field(ui), { key: 'Enter' })
    await Promise.resolve()
    expect(ui.resend).toHaveBeenCalledWith(7, 'hello')
  })

  it('sends Enter after IME composition ends', async () => {
    vi.useFakeTimers()
    const ui = mount({ content: [textBlock('hello')] })
    fireEvent.compositionStart(field(ui))
    fireEvent.compositionEnd(field(ui))
    await vi.advanceTimersByTimeAsync(20)
    fireEvent.keyDown(field(ui), { key: 'Enter' })
    await Promise.resolve()
    expect(ui.resend).toHaveBeenCalledWith(7, 'hello')
    vi.useRealTimers()
  })

  it('disables send when the draft is only whitespace', () => {
    const ui = mount({ content: [textBlock('hello')] })
    fireEvent.change(field(ui), { target: { value: '   ' } })
    expect((ui.getByRole('button', { name: zh['action.send'] }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.keyDown(field(ui), { key: 'Enter' })
    expect(ui.resend).not.toHaveBeenCalled()
  })

  it('blocks send while the session is running and announces the reason', () => {
    const ui = mount({
      content: [textBlock('hello')],
      snapshot: { nodes: [{ kind: 'user', seq: 7 }], running: true },
    })
    expect((ui.getByRole('button', { name: zh['action.send'] }) as HTMLButtonElement).disabled).toBe(true)
    expect(ui.getByRole('status').textContent).toBe(zh['editor.hint.running'])
    expect(field(ui).getAttribute('aria-describedby')).toBe(ui.getByRole('status').id)
    fireEvent.keyDown(field(ui), { key: 'Enter' })
    expect(ui.resend).not.toHaveBeenCalled()
  })

  it('blocks send when a newer user message arrived mid-edit', () => {
    const ui = mount({
      content: [textBlock('hello')],
      snapshot: { nodes: [{ kind: 'user', seq: 7 }, { kind: 'user', seq: 9 }], running: false },
    })
    expect((ui.getByRole('button', { name: zh['action.send'] }) as HTMLButtonElement).disabled).toBe(true)
    expect(ui.getByRole('status').textContent).toBe(zh['editor.hint.stale'])
  })

  it('locks the row while resend is in flight and settles afterwards', async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    const ui = mount({ content: [textBlock('hello')], resendResult: gate })
    fireEvent.click(ui.getByRole('button', { name: zh['action.send'] }))
    expect((ui.getByRole('button', { name: zh['action.pending'] }) as HTMLButtonElement).disabled).toBe(true)
    expect((ui.getByRole('button', { name: zh['action.cancel'] }) as HTMLButtonElement).disabled).toBe(true)
    expect(field(ui).disabled).toBe(true)
    expect(ui.container.querySelector('[aria-busy]')).not.toBeNull()
    fireEvent.keyDown(field(ui), { key: 'Escape' })
    expect(ui.cancelEdit).not.toHaveBeenCalled()
    fireEvent.click(ui.getByRole('button', { name: zh['action.pending'] }))
    expect(ui.resend).toHaveBeenCalledTimes(1)
    release()
    await waitFor(() => {
      expect((ui.getByRole('button', { name: zh['action.send'] }) as HTMLButtonElement).disabled).toBe(false)
    })
  })

  it('keeps the editor armed with the draft when resend rejects', async () => {
    const ui = mount({
      content: [textBlock('hello')],
      resendResult: Promise.reject(new Error('fork-unavailable')),
    })
    fireEvent.change(field(ui), { target: { value: 'revised' } })
    fireEvent.click(ui.getByRole('button', { name: zh['action.send'] }))
    await waitFor(() => {
      expect(ui.notify).toHaveBeenCalledWith(zh['error.generic'])
    })
    // The draft is the operator's work: no cancel, field re-enabled and refocused.
    expect(ui.cancelEdit).not.toHaveBeenCalled()
    expect(field(ui).value).toBe('revised')
    expect(field(ui).disabled).toBe(false)
    expect(document.activeElement).toBe(field(ui))
    // Retry stays live on the same editor.
    fireEvent.click(ui.getByRole('button', { name: zh['action.send'] }))
    expect(ui.resend).toHaveBeenCalledTimes(2)
    await waitFor(() => { expect(ui.notify).toHaveBeenCalledTimes(2) })
  })

  it('refits the field height when the bubble width changes', () => {
    const ui = mount({ content: [textBlock('hello')] })
    const el = field(ui)
    el.style.height = ''
    const observer = {} as ResizeObserver
    const entry = (width: number) => [{ contentRect: { width } } as ResizeObserverEntry]
    resizeCallbacks.at(-1)?.(entry(300), observer)
    expect(el.style.height).not.toBe('')
    // Same width and empty batches change nothing.
    el.style.height = ''
    resizeCallbacks.at(-1)?.(entry(300), observer)
    resizeCallbacks.at(-1)?.([], observer)
    expect(el.style.height).toBe('')
  })

  it('publishes no state after the editor unmounts mid-flight', async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    const ui = mount({ content: [textBlock('hello')], resendResult: gate })
    fireEvent.click(ui.getByRole('button', { name: zh['action.send'] }))
    ui.unmount()
    release()
    await gate
  })

  it('notifies nothing after an unmount that outruns a failing resend', async () => {
    let reject!: (error: Error) => void
    const gate = new Promise<void>((_resolve, r) => { reject = r })
    const ui = mount({ content: [textBlock('hello')], resendResult: gate })
    fireEvent.click(ui.getByRole('button', { name: zh['action.send'] }))
    ui.unmount()
    reject(new Error('fork-unavailable'))
    await gate.catch(() => {})
    await Promise.resolve()
    expect(ui.notify).not.toHaveBeenCalled()
  })
})
