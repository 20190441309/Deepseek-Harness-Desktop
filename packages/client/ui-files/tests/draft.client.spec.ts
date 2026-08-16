/**
 * appendToDraft writes through ctx.get('conversation') without importing the plugin.
 */
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { appendToDraft } from '../src/client/draft.ts'

describe('appendToDraft', () => {
  it('returns false when conversation is missing', () => {
    const ctx = new Context()
    ctx.provide('sessions', { scope: () => ({}) })
    expect(appendToDraft(ctx as never, 'sess', '`@a.ts`')).toBe(false)
  })

  it('returns false when session scope is missing', () => {
    const ctx = new Context()
    ctx.provide('sessions', { scope: () => undefined })
    ctx.provide('conversation', {
      input: { for: () => ({ setDraft: vi.fn(), state: { getSnapshot: () => ({ draft: '' }) } }) },
    })
    expect(appendToDraft(ctx as never, 'sess', '`@a.ts`')).toBe(false)
  })

  it('appends with a space when a draft already exists', () => {
    const ctx = new Context()
    const setDraft = vi.fn()
    ctx.provide('sessions', { scope: () => ({}) })
    ctx.provide('conversation', {
      input: {
        for: () => ({
          setDraft,
          state: { getSnapshot: () => ({ draft: 'hello' }) },
        }),
      },
    })
    expect(appendToDraft(ctx as never, 'sess', '`@a.ts`')).toBe(true)
    expect(setDraft).toHaveBeenCalledWith('hello `@a.ts`')
  })

  it('writes the fragment alone when the draft is empty', () => {
    const ctx = new Context()
    const setDraft = vi.fn()
    ctx.provide('sessions', { scope: () => ({}) })
    ctx.provide('conversation', {
      input: {
        for: () => ({
          setDraft,
          state: { getSnapshot: () => ({ draft: '' }) },
        }),
      },
    })
    expect(appendToDraft(ctx as never, 'sess', '`@a.ts`')).toBe(true)
    expect(setDraft).toHaveBeenCalledWith('`@a.ts`')
  })
})
