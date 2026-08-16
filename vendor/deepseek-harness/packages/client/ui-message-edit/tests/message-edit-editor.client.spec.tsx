// @vitest-environment jsdom
/**
 * MessageEditEditor: the bubble-replacement textarea prefills joined text,
 * cancel restores the owner, send runs the inject resend verb with the draft,
 * empty drafts cannot send, and a rejected resend notifies then cancels.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { zh as commonZh } from '@deepseek-ai/dsh-client-locale/src/locales/zh.ts'
import { MessageEditEditor } from '../src/client/MessageEditEditor.tsx'
import type { MessageEditEditorProps } from '../src/client/slots.ts'
import { zh } from '../src/client/locales.ts'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const t = makeTranslate(zh, commonZh)

function mount(options: {
  seq?: number
  content: readonly unknown[]
  resendResult?: Promise<void>
}) {
  const resend = vi.fn((_seq: number, _text: string) => options.resendResult ?? Promise.resolve())
  const notify = vi.fn()
  const cancelEdit = vi.fn()
  const props = {
    seq: options.seq ?? 7,
    content: options.content as MessageEditEditorProps['content'],
    cancelEdit,
    resend,
    notify,
    t,
  } as unknown as MessageEditEditorProps
  return { ...render(<MessageEditEditor {...props} />), resend, notify, cancelEdit }
}

const textBlock = (text: string) => ({ type: 'text' as const, text })

describe('MessageEditEditor', () => {
  it('prefills joined text blocks and focuses the field', () => {
    const ui = mount({ content: [textBlock('part one '), textBlock('part two')] })
    const field = ui.getByRole('textbox', { name: zh['action.edit'] }) as HTMLTextAreaElement
    expect(field.value).toBe('part one part two')
    expect(document.activeElement).toBe(field)
  })

  it('opens empty when the message is not plain text', () => {
    const ui = mount({
      content: [{ type: 'text', text: 'caption' }, { type: 'image', attachment: { attachmentId: 'a' } }],
    })
    const field = ui.getByRole('textbox', { name: zh['action.edit'] }) as HTMLTextAreaElement
    expect(field.value).toBe('')
    expect((ui.getByRole('button', { name: zh['action.send'] }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('restores the bubble through cancelEdit', () => {
    const ui = mount({ content: [textBlock('hello')] })
    fireEvent.click(ui.getByRole('button', { name: zh['action.cancel'] }))
    expect(ui.cancelEdit).toHaveBeenCalledTimes(1)
    expect(ui.resend).not.toHaveBeenCalled()
  })

  it('restores the bubble on Escape', () => {
    const ui = mount({ content: [textBlock('hello')] })
    fireEvent.keyDown(ui.getByRole('textbox', { name: zh['action.edit'] }), { key: 'Escape' })
    expect(ui.cancelEdit).toHaveBeenCalledTimes(1)
  })

  it('sends the edited draft through resend and not the original text', async () => {
    const ui = mount({ seq: 7, content: [textBlock('hello')] })
    const field = ui.getByRole('textbox', { name: zh['action.edit'] })
    fireEvent.change(field, { target: { value: 'revised' } })
    fireEvent.click(ui.getByRole('button', { name: zh['action.send'] }))
    await Promise.resolve()
    expect(ui.resend).toHaveBeenCalledWith(7, 'revised')
    expect(ui.notify).not.toHaveBeenCalled()
    expect(ui.cancelEdit).not.toHaveBeenCalled()
  })

  it('sends on Enter and inserts a newline on Shift+Enter', async () => {
    const ui = mount({ content: [textBlock('hello')] })
    const field = ui.getByRole('textbox', { name: zh['action.edit'] })
    fireEvent.keyDown(field, { key: 'Enter', shiftKey: true })
    expect(ui.resend).not.toHaveBeenCalled()
    fireEvent.keyDown(field, { key: 'Enter', repeat: true })
    expect(ui.resend).not.toHaveBeenCalled()
    fireEvent.keyDown(field, { key: 'Enter', isComposing: true })
    expect(ui.resend).not.toHaveBeenCalled()
    fireEvent.keyDown(field, { key: 'Enter', keyCode: 229 })
    expect(ui.resend).not.toHaveBeenCalled()
    fireEvent.compositionStart(field)
    fireEvent.keyDown(field, { key: 'Enter' })
    expect(ui.resend).not.toHaveBeenCalled()
  })

  it('sends a non-composing Enter', async () => {
    const ui = mount({ content: [textBlock('hello')] })
    fireEvent.keyDown(ui.getByRole('textbox', { name: zh['action.edit'] }), { key: 'Enter' })
    await Promise.resolve()
    expect(ui.resend).toHaveBeenCalledWith(7, 'hello')
  })

  it('sends Enter after IME composition ends', async () => {
    vi.useFakeTimers()
    const ui = mount({ content: [textBlock('hello')] })
    const field = ui.getByRole('textbox', { name: zh['action.edit'] })
    fireEvent.compositionStart(field)
    fireEvent.compositionEnd(field)
    await vi.advanceTimersByTimeAsync(20)
    fireEvent.keyDown(field, { key: 'Enter' })
    await Promise.resolve()
    expect(ui.resend).toHaveBeenCalledWith(7, 'hello')
    vi.useRealTimers()
  })

  it('disables send when the draft is only whitespace', () => {
    const ui = mount({ content: [textBlock('hello')] })
    fireEvent.change(ui.getByRole('textbox', { name: zh['action.edit'] }), { target: { value: '   ' } })
    expect((ui.getByRole('button', { name: zh['action.send'] }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.keyDown(ui.getByRole('textbox', { name: zh['action.edit'] }), { key: 'Enter' })
    expect(ui.resend).not.toHaveBeenCalled()
  })

  it('locks the row while resend is in flight and settles afterwards', async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    const ui = mount({ content: [textBlock('hello')], resendResult: gate })
    fireEvent.click(ui.getByRole('button', { name: zh['action.send'] }))
    expect((ui.getByRole('button', { name: zh['action.pending'] }) as HTMLButtonElement).disabled).toBe(true)
    expect((ui.getByRole('button', { name: zh['action.cancel'] }) as HTMLButtonElement).disabled).toBe(true)
    expect((ui.getByRole('textbox', { name: zh['action.edit'] }) as HTMLTextAreaElement).disabled).toBe(true)
    fireEvent.keyDown(ui.getByRole('textbox', { name: zh['action.edit'] }), { key: 'Escape' })
    expect(ui.cancelEdit).not.toHaveBeenCalled()
    fireEvent.click(ui.getByRole('button', { name: zh['action.pending'] }))
    expect(ui.resend).toHaveBeenCalledTimes(1)
    release()
    await waitFor(() => {
      expect((ui.getByRole('button', { name: zh['action.send'] }) as HTMLButtonElement).disabled).toBe(false)
    })
  })

  it('notifies and restores the bubble when resend rejects', async () => {
    const ui = mount({
      content: [textBlock('hello')],
      resendResult: Promise.reject(new Error('fork-unavailable')),
    })
    fireEvent.click(ui.getByRole('button', { name: zh['action.send'] }))
    await Promise.resolve()
    await Promise.resolve()
    expect(ui.notify).toHaveBeenCalledWith(zh['error.generic'])
    expect(ui.cancelEdit).toHaveBeenCalledTimes(1)
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
})
