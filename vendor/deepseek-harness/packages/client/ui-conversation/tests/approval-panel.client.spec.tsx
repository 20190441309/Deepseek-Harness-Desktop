// @vitest-environment jsdom
// ApprovalPanel composer takeover: the same Interface Settings resize
// handles as InputBar, plus adoption of a size already published on the
// composer seat so a takeover does not snap back to the auto-grow cap.

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import type { ReactNode } from 'react'
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-web-react'
import {
  createSnapshotStore, EMPTY_CHAT_SNAPSHOT, EMPTY_CONVERSATION_VIEWS, PendingWait,
} from '@deepseek-ai/dsh-client-runtime/client'
import { RpcId } from '@deepseek-ai/dsh-client-connection/client'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { zh as commonZh } from '@deepseek-ai/dsh-client-locale/src/locales/zh.ts'
import type { ConversationSnapshot, SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import type { ApprovalComposerProps } from '../src/client/contract/slots.ts'
import { ApprovalPanel } from '../src/client/skeleton/ApprovalPanel.tsx'
import { zh } from '../src/client/locales.ts'

afterEach(cleanup)

const SID = 's1' as SessionId

function snapshotOf(overrides: Partial<ConversationSnapshot> = {}): ConversationSnapshot {
  return {
    sessionId: SID, views: EMPTY_CONVERSATION_VIEWS, chat: EMPTY_CHAT_SNAPSHOT,
    nodes: [], turnTimings: new Map(), turnEnds: new Map(), partial: null, runningCalls: [],
    pending: [], queue: [], running: false, composerPhase: 'active', removed: false,
    openState: 'open', openError: null, hasMore: false, loadingOlder: false,
    promptError: null, blank: false, subagent: null, lastAgentError: null,
    ...overrides,
  }
}

function bench(over?: { composerResize?: boolean; seat?: HTMLDivElement }) {
  const respond = vi.fn(() => Promise.resolve({ accepted: true as const }))
  const carrier = new PendingWait(
    'approval', RpcId('r1'), SID,
    { approvalId: 'ap1', toolName: 'bash', reason: '需要审批' } as PendingWait<'approval'>['payload'],
    respond,
  )
  const session = createSnapshotStore<ConversationSnapshot>(snapshotOf({
    pending: [carrier],
  }))
  const props = {
    matched: carrier,
    interactions: [carrier],
    session: session.getSnapshot(),
    sessionId: SID,
    SessionProvider: ({ children }: { children: (id: SessionId) => ReactNode }) => children(SID),
    useSession: bindSnapshotSelector(session),
    useSessions: bindSnapshotSelector(createSnapshotStore({
      ids: [], byId: {}, current: undefined, phase: 'ready',
      subagentsByParent: {}, jobsBySession: {}, currentAddress: undefined,
    })),
    useWorkspaces: bindSnapshotSelector(createSnapshotStore({
      items: [], archivedSessionIds: [], state: 'idle', phase: 'ready', error: null,
      baselinesReady: true, recentWorkspaceId: undefined,
    })),
    useProjection: () => undefined,
    useInput: () => { throw new Error('unused') },
    inputActions: { setDraft: () => { throw new Error('unused') }, submit: () => { throw new Error('unused') } },
    useComposerResize: (sel: (value: boolean) => boolean) => sel(over?.composerResize ?? false),
    t: makeTranslate(zh, commonZh),
  } as unknown as ApprovalComposerProps
  const view = over?.seat === undefined
    ? render(<ApprovalPanel {...props} />)
    : render(<ApprovalPanel {...props} />, { container: over.seat })
  return { view, props, respond }
}

describe('ApprovalPanel composer resize', () => {
  it('hides the composer resize handle until Interface settings turn it on', () => {
    expect(bench().view.container.querySelectorAll('[data-composer-resize-handle]')).toHaveLength(0)
    const live = bench({ composerResize: true })
    expect(live.view.container.querySelectorAll('[data-composer-resize-handle]')).toHaveLength(3)
  })

  it('drags the approval detail box taller from its top edge when resize is on', () => {
    const { view } = bench({ composerResize: true })
    const scroll = view.container.querySelector('[data-approval-scroll]') as HTMLElement
    const handle = view.container.querySelector('[data-composer-resize-edge="top"]') as HTMLElement
    vi.spyOn(scroll, 'getBoundingClientRect').mockReturnValue({
      x: 0, y: 0, width: 400, height: 80, top: 0, left: 0, bottom: 80, right: 400, toJSON() { return this },
    })
    fireEvent.pointerDown(handle, { pointerId: 1, clientY: 400, button: 0 })
    fireEvent.pointerMove(handle, { pointerId: 1, clientY: 350 })
    fireEvent.pointerUp(handle, { pointerId: 1, clientY: 350 })
    expect(scroll.style.height).toBe('130px')
    expect(scroll.hasAttribute('data-composer-resized')).toBe(true)
  })

  it('drags the approval card wider from either vertical edge when resize is on', () => {
    const { view } = bench({ composerResize: true })
    const card = view.container.querySelector('[data-composer-card]') as HTMLElement
    Object.defineProperty(card.parentElement, 'clientWidth', { configurable: true, value: 900 })
    vi.spyOn(card, 'getBoundingClientRect').mockReturnValue({
      x: 0, y: 0, width: 400, height: 80, top: 0, left: 0, bottom: 80, right: 400, toJSON() { return this },
    })
    const right = view.container.querySelector('[data-composer-resize-edge="right"]') as HTMLElement
    fireEvent.pointerDown(right, { pointerId: 1, clientX: 500, button: 0 })
    fireEvent.pointerMove(right, { pointerId: 1, clientX: 560 })
    fireEvent.pointerUp(right, { pointerId: 1, clientX: 560 })
    expect(card.style.width).toBe('460px')
    expect(card.hasAttribute('data-composer-resized-width')).toBe(true)
    const left = view.container.querySelector('[data-composer-resize-edge="left"]') as HTMLElement
    fireEvent.pointerDown(left, { pointerId: 2, clientX: 100, button: 0 })
    fireEvent.pointerMove(left, { pointerId: 2, clientX: 40 })
    fireEvent.pointerUp(left, { pointerId: 2, clientX: 40 })
    expect(card.style.width).toBe('460px')
  })

  it('clears a dragged size when Interface settings turn resize off', () => {
    const { view, props } = bench({ composerResize: true })
    const scroll = view.container.querySelector('[data-approval-scroll]') as HTMLElement
    const card = view.container.querySelector('[data-composer-card]') as HTMLElement
    const handle = view.container.querySelector('[data-composer-resize-edge="top"]') as HTMLElement
    vi.spyOn(scroll, 'getBoundingClientRect').mockReturnValue({
      x: 0, y: 0, width: 400, height: 80, top: 0, left: 0, bottom: 80, right: 400, toJSON() { return this },
    })
    fireEvent.pointerDown(handle, { pointerId: 1, clientY: 400, button: 0 })
    fireEvent.pointerMove(handle, { pointerId: 1, clientY: 350 })
    expect(scroll.style.height).toBe('130px')
    view.rerender(<ApprovalPanel {...props} useComposerResize={sel => sel(false)} />)
    expect(scroll.style.height).toBe('')
    expect(scroll.hasAttribute('data-composer-resized')).toBe(false)
    expect(card.style.width).toBe('')
    expect(card.hasAttribute('data-composer-resized-width')).toBe(false)
    expect(view.container.querySelector('[data-composer-resize-handle]')).toBeNull()
  })

  it('adopts a size already published on the composer seat', () => {
    const seat = document.createElement('div')
    seat.dataset.composerSeat = ''
    seat.dataset.composerResized = ''
    seat.dataset.composerResizedWidth = ''
    seat.style.setProperty('--dsh-composer-resized-height', '200px')
    seat.style.setProperty('--dsh-composer-resized-width', '480px')
    document.body.appendChild(seat)
    const { view } = bench({ composerResize: true, seat })
    const scroll = view.container.querySelector('[data-approval-scroll]') as HTMLElement
    const card = view.container.querySelector('[data-composer-card]') as HTMLElement
    expect(scroll.style.height).toBe('200px')
    expect(scroll.hasAttribute('data-composer-resized')).toBe(true)
    expect(card.style.width).toBe('480px')
    expect(card.hasAttribute('data-composer-resized-width')).toBe(true)
    seat.remove()
  })

  it('publishes a dragged size onto the composer seat for the overlay InputBar', () => {
    const seat = document.createElement('div')
    seat.dataset.composerSeat = ''
    document.body.appendChild(seat)
    const { view } = bench({ composerResize: true, seat })
    const scroll = view.container.querySelector('[data-approval-scroll]') as HTMLElement
    const handle = view.container.querySelector('[data-composer-resize-edge="top"]') as HTMLElement
    vi.spyOn(scroll, 'getBoundingClientRect').mockReturnValue({
      x: 0, y: 0, width: 400, height: 80, top: 0, left: 0, bottom: 80, right: 400, toJSON() { return this },
    })
    fireEvent.pointerDown(handle, { pointerId: 1, clientY: 400, button: 0 })
    fireEvent.pointerMove(handle, { pointerId: 1, clientY: 350 })
    expect(seat.style.getPropertyValue('--dsh-composer-resized-height')).toBe('130px')
    expect(seat.hasAttribute('data-composer-resized')).toBe(true)
    seat.remove()
  })
})
