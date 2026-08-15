// @vitest-environment jsdom
/**
 * ui-message-edit browser half on a real cordis Context with fake slots/
 * sessions/conversation faces: the plugin registers the edit entry at
 * conversation.chat.user-actions; the inject edit verb forks with beforeSeq,
 * opens the child, and prefills its composer; notify routes to the source
 * Session's input facade; registration rides the plugin fiber (HMR safety).
 * The node half is exercised over the same Context.
 */
import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup } from '@testing-library/react'
import { SlotRegistry, type SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import type { MessageEditInjected } from '../src/client/slots.ts'
import { apply, inject } from '../src/client/index.ts'
import { apply as nodeApply } from '../src/index.ts'

afterEach(cleanup)

const sid = (k: string): SessionId => k as SessionId

/** Boot the plugin over fake faces; sessions/conversation record every call. */
async function bench() {
  const ctx = new Context()
  const calls: { method: string; args: unknown[] }[] = []
  const drafts: Array<{ sessionId: string; text: string }> = []
  const notices: Array<{ sessionId: string; message: string }> = []

  const sessions = {
    fork: vi.fn(async (opts: { sessionId: SessionId; beforeSeq?: number }) => {
      calls.push({ method: 'fork', args: [opts] })
      return 'child-1'
    }),
    open: vi.fn((id: SessionId) => { calls.push({ method: 'open', args: [id] }) }),
    scope: vi.fn((id: SessionId) => ({ sessionId: id })),
  }
  ctx.provide('sessions', sessions)

  const conversation = {
    input: {
      for: vi.fn((scope: { sessionId: SessionId }) => ({
        setDraft: (text: string) => { drafts.push({ sessionId: scope.sessionId, text }) },
        notify: (level: 'info' | 'error', message: string) => {
          notices.push({ sessionId: scope.sessionId, message: `${level}:${message}` })
        },
      })),
    },
  }
  ctx.provide('conversation', conversation)

  await ctx.plugin(SlotRegistry).await()
  ctx.slots.register({
    name: 'root',
    children: { 'conversation.chat.user-actions': { kind: 'list', scope: 'session' } },
  } as never, (() => null) as never)
  ctx.provide('locale', new LocaleRuntime(ctx))
  const fiber = ctx.plugin({ inject: [...inject], apply })
  return {
    ctx,
    fiber,
    calls,
    drafts,
    notices,
    sessions,
    conversation,
    entry: () => {
      const entry = ctx.slots.entries('conversation.chat.user-actions')[0]
      if (entry === undefined) return undefined
      return {
        ...entry.options,
        locale: entry.locale,
        inject: entry.inject as unknown as ((sessionId: SessionId) => MessageEditInjected) | undefined,
      }
    },
  }
}

describe('ui-message-edit browser plugin', () => {
  it('registers the edit entry with the documented id, order, and locale', async () => {
    const b = await bench()
    await b.fiber.await()

    expect(b.entry()).toMatchObject({ id: 'edit', order: 10, locale: 'messageEdit' })
    expect(b.entry()?.inject).toBeTypeOf('function')
  })

  it('forks with beforeSeq, opens the child, and prefills its draft', async () => {
    const b = await bench()
    await b.fiber.await()

    const face = b.entry()!.inject!(sid('s1'))
    await face.edit(7, 'revised prompt')

    expect(b.calls).toEqual([
      { method: 'fork', args: [{ sessionId: 's1', beforeSeq: 7, increaseTitle: true }] },
      { method: 'open', args: ['child-1'] },
    ])
    expect(b.drafts).toEqual([{ sessionId: 'child-1', text: 'revised prompt' }])
  })

  it('rejects loudly when the child scope cannot be resolved', async () => {
    const b = await bench()
    await b.fiber.await()
    b.sessions.scope.mockReturnValue(undefined as never)

    const face = b.entry()!.inject!(sid('s1'))
    await expect(face.edit(7, 'text')).rejects.toThrow(/child scope unavailable/)
    expect(b.drafts).toHaveLength(0)
  })

  it('notify publishes on the source Session input facade', async () => {
    const b = await bench()
    await b.fiber.await()

    const face = b.entry()!.inject!(sid('s1'))
    face.notify('boom')

    expect(b.notices).toEqual([{ sessionId: 's1', message: 'error:boom' }])
  })

  it('withdraws the registration with the plugin fiber', async () => {
    const b = await bench()
    await b.fiber.await()
    await b.fiber.dispose()

    expect(b.ctx.slots.entries('conversation.chat.user-actions')).toHaveLength(0)
  })

  it('re-registers cleanly when the plugin is reloaded', async () => {
    const b = await bench()
    await b.fiber.await()
    await b.fiber.dispose()

    const reloaded = b.ctx.plugin({ inject: [...inject], apply })
    await reloaded.await()

    expect(b.ctx.slots.entries('conversation.chat.user-actions')).toHaveLength(1)
    expect(b.entry()).toMatchObject({ id: 'edit' })
  })

  it('the node half applies without host-side behavior', () => {
    expect(() => { nodeApply() }).not.toThrow()
  })
})
