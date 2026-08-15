// @vitest-environment jsdom
/** Conversation assembly acceptance independent of Tool presentation. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, waitFor, within } from '@testing-library/react'
import { useState } from 'react'
import { LocaleRuntime, COMMON_NS } from '@deepseek-ai/dsh-client-locale/client'
import { zh as commonZh } from '@deepseek-ai/dsh-client-locale/src/locales/zh.ts'
import type { ISession, SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import type { PropsRenderSlots } from '@deepseek-ai/dsh-client-ui-slots'
import { SlotTestRuntime, usePinnedBrowserLanguages, stubSettingsScope } from '@deepseek-ai/dsh-client-test-runtime'
import { apply, inject, type EmptyWorkspaceOwnerProps, type UserActionOwnerProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import { chatSnapshotFixture } from './chat-snapshot-fixture.client.ts'

usePinnedBrowserLanguages('zh-CN')

const SID = 's1' as SessionId

/** jsdom has no ResizeObserver; the composer seat publishes its height through one. */
class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})
beforeEach(() => {
  localStorage.clear()
  vi.stubGlobal('ResizeObserver', ResizeObserverStub)
})

type AppRootProps = PropsRenderSlots<'conversation' | 'details'>
function AppRoot({ renderSlot }: AppRootProps) {
  return <>{renderSlot('conversation', {})}</>
}

const LAYOUT_CHILDREN = {
  'conversation': { kind: 'single', scope: 'session-maybe' },
  'details': { kind: 'single', scope: 'session' },
} as const

function WorkspaceProbe({ open }: EmptyWorkspaceOwnerProps) {
  const [count, setCount] = useState(0)
  return (
    <button data-testid="workspace-probe" onClick={() => { setCount(value => value + 1) }}>
      {String(open)}:{count}
    </button>
  )
}

/** Registers on `conversation.chat.user-actions` and echoes its owner currency. */
function UserActionsProbe({ seq, content }: UserActionOwnerProps) {
  const text = content.map(block => (block as { text?: string }).text ?? '').join('')
  return <button data-testid="user-actions-probe" type="button">{String(seq)}:{text}</button>
}

async function bench(opts?: { blank?: boolean }) {
  const runtime = await SlotTestRuntime.create()
  runtime.provide('connection', { api: { settings: {} }, isLoopback: false })
  // The plugin injects both; these specs exercise no settings path.
  runtime.provide('remote', { $on: () => () => {} })
  runtime.provide('settingsScope', { bind: () => stubSettingsScope().scope } as never)
  runtime.provide('layout', { openDetails: vi.fn(), closeDetails: vi.fn() })
  const locale = new LocaleRuntime(runtime.ctx)
  runtime.provide('locale', locale)
  runtime.slots.installLocale(locale)
  await runtime.sessions.add({
    id: SID,
    summary: { title: 'S', displayTitle: 'S', cwd: '/proj' },
    snapshot: {
      nodes: [],
      ...(opts?.blank === true ? { blank: true, composerPhase: 'blank' as const } : {}),
    },
    session: {
      loadOlder: vi.fn<ISession['loadOlder']>(),
      prompt: vi.fn<ISession['prompt']>(async () => ({ ok: true, value: { accepted: true } })),
    },
  })
  await runtime.root.declare(LAYOUT_CHILDREN, AppRoot)
  await runtime.mount({ inject: [...inject], apply })
  return runtime
}

describe('resident composer', () => {
  it('renders the locked view state while no session exists at all', async () => {
    const runtime = await SlotTestRuntime.create()
    runtime.provide('connection', { api: { settings: {} }, isLoopback: false })
    // The plugin injects both; these specs exercise no settings path.
    runtime.provide('remote', { $on: () => () => {} })
    runtime.provide('settingsScope', { bind: () => stubSettingsScope().scope } as never)
    runtime.provide('layout', { openDetails: vi.fn(), closeDetails: vi.fn() })
    const locale = new LocaleRuntime(runtime.ctx)
    runtime.provide('locale', locale)
    runtime.slots.installLocale(locale)
    await runtime.root.declare(LAYOUT_CHILDREN, AppRoot)
    await runtime.mount({ inject: [...inject], apply })
    runtime.slots.register({ name: 'conversation.hero.workspace' }, WorkspaceProbe)
    const view = runtime.renderRoot()
    const textarea = view.container.querySelector('textarea')
    expect(textarea).not.toBeNull()
    expect(textarea!.disabled).toBe(false)
    expect(textarea!.readOnly).toBe(true)
    expect(textarea!.getAttribute('aria-haspopup')).toBe('menu')
    expect(view.getByTestId('workspace-probe').textContent).toBe('false:0')
    fireEvent.click(textarea!)
    expect(view.getByTestId('workspace-probe').textContent).toBe('true:0')
    expect(textarea!.getAttribute('aria-expanded')).toBe('true')
    fireEvent.click(view.getByRole('button', { name: '选择工作区' }))
    fireEvent.keyDown(textarea!, { key: 'Enter' })
    expect(view.getByTestId('workspace-probe').textContent).toBe('true:0')
    expect(view.getByRole('button', { name: '选择工作区' })).toBeTruthy()
    await runtime.dispose()
  })

  it('keeps the complete Hero tree mounted when the first Workspace session appears', async () => {
    const runtime = await SlotTestRuntime.create()
    runtime.provide('connection', { api: { settings: {} }, isLoopback: false })
    // The plugin injects both; these specs exercise no settings path.
    runtime.provide('remote', { $on: () => () => {} })
    runtime.provide('settingsScope', { bind: () => stubSettingsScope().scope } as never)
    runtime.provide('layout', { openDetails: vi.fn(), closeDetails: vi.fn() })
    const locale = new LocaleRuntime(runtime.ctx)
    runtime.provide('locale', locale)
    runtime.slots.installLocale(locale)
    await runtime.workspaces.update((draft) => {
      draft.items = [{ workspaceId: 'w1', title: 'Proj', path: '/proj', sessionIds: [SID] }] as never
    })
    await runtime.root.declare(LAYOUT_CHILDREN, AppRoot)
    await runtime.mount({ inject: [...inject], apply })
    runtime.slots.register({ name: 'conversation.hero.workspace' }, WorkspaceProbe)
    const view = runtime.renderRoot()

    const root = view.container.querySelector('[data-phase="hero"]')!
    const scrollBody = view.container.querySelector('[data-conversation-scroll]')!
    const composerSeat = view.container.querySelector('[data-composer-seat]')!
    const textarea = view.container.querySelector('textarea')!
    const workspaceChip = view.getByRole('button', { name: '选择工作区' })
    const workspaceProbe = view.getByTestId('workspace-probe')
    expect(textarea.disabled).toBe(false)
    expect(textarea.readOnly).toBe(true)

    fireEvent.click(workspaceChip)
    fireEvent.click(workspaceProbe)
    expect(workspaceProbe.textContent).toBe('true:1')

    await runtime.sessions.add({
      id: SID,
      summary: { title: 'S', displayTitle: 'S', cwd: '/proj', blank: true },
      snapshot: { blank: true, composerPhase: 'blank' },
    })

    expect(view.container.querySelector('[data-phase="hero"]')).toBe(root)
    expect(view.container.querySelector('[data-conversation-scroll]')).toBe(scrollBody)
    expect(view.container.querySelector('[data-composer-seat]')).toBe(composerSeat)
    expect(view.container.querySelector('textarea')).toBe(textarea)
    expect(view.getByRole('button', { name: '选择工作区' })).toBe(workspaceChip)
    expect(view.getByTestId('workspace-probe')).toBe(workspaceProbe)
    expect(workspaceProbe.textContent).toBe('true:1')
    expect(textarea.disabled).toBe(false)
    expect(textarea.readOnly).toBe(false)
    await runtime.dispose()
  })

  it('the textarea survives the blank→active conversion as the same DOM node', async () => {
    const runtime = await bench({ blank: true })
    await runtime.workspaces.update((draft) => {
      draft.items = [{ workspaceId: 'w1', title: 'Proj', path: '/proj', sessionIds: [SID] }] as never
    })
    const view = runtime.renderRoot()
    const hero = view.container.querySelector('textarea')
    expect(hero).not.toBeNull()
    expect(hero!.disabled).toBe(false)

    await runtime.sessions.updateSnapshot(SID, (draft) => {
      draft.blank = false
      draft.composerPhase = 'active'
    })
    expect(view.container.querySelector('textarea')).toBe(hero)
    await runtime.dispose()
  })
})

describe('prompt rejection through the assembled composer', () => {
  it('renders the promptError alert strip and keeps the draft in the machine', async () => {
    const runtime = await SlotTestRuntime.create()
    runtime.provide('connection', { api: { settings: {} }, isLoopback: false })
    // The plugin injects both; these specs exercise no settings path.
    runtime.provide('remote', { $on: () => () => {} })
    runtime.provide('settingsScope', { bind: () => stubSettingsScope().scope } as never)
    runtime.provide('layout', { openDetails: vi.fn(), closeDetails: vi.fn() })
    const locale = new LocaleRuntime(runtime.ctx)
    runtime.provide('locale', locale)
    runtime.slots.installLocale(locale)
    const prompt = vi.fn<ISession['prompt']>(async () => ({
      ok: false, error: { code: 'agent-busy', message: 'prompt rejected before acceptance', details: { reason: 'busy' } },
    }))
    await runtime.sessions.add({
      id: SID,
      summary: { title: 'S', displayTitle: 'S', cwd: '/proj' },
      session: { prompt, loadOlder: vi.fn<ISession['loadOlder']>() },
    })
    await runtime.root.declare(LAYOUT_CHILDREN, AppRoot)
    await runtime.mount({ inject: [...inject], apply })
    const view = runtime.renderRoot()

    const composer = view.container.querySelector('textarea')!
    fireEvent.change(composer, { target: { value: 'do not lose this' } })
    fireEvent.keyDown(composer, { key: 'Enter' })
    await waitFor(() => { expect(prompt).toHaveBeenCalledOnce() })

    await runtime.sessions.updateSnapshot(SID, (draft) => {
      draft.promptError = {
        op: 'send',
        error: { code: 'agent-busy', message: 'prompt rejected before acceptance', details: { reason: 'busy' } },
      }
    })
    const alert = await view.findByRole('alert')
    expect(alert.textContent).toContain('prompt rejected before acceptance (agent-busy)')
    await waitFor(() => {
      expect((view.container.querySelector('textarea'))!.value).toBe('do not lose this')
    })
    await runtime.dispose()
  })
})

describe('title projection across assembled surfaces', () => {
  it('one summary update re-labels the current-session crumb', async () => {
    const runtime = await bench()
    const view = runtime.renderRoot()
    const hierarchy = view.getByRole('navigation', { name: '会话层级' })
    expect(within(hierarchy).getByRole('button', { name: 'S' }).hasAttribute('disabled')).toBe(true)

    await runtime.sessions.updateSummary(SID, { displayTitle: '修订标题', title: '修订标题' })
    await waitFor(() => {
      expect(within(hierarchy).getByRole('button', { name: '修订标题' }).hasAttribute('disabled')).toBe(true)
    })
    expect(within(hierarchy).queryByRole('button', { name: 'S' })).toBeNull()
    await runtime.dispose()
  })
})

describe('user-message action strip assembly', () => {
  it('renders registered user actions inside the user row with the message owner currency; steering stays strip-free', async () => {
    const runtime = await bench()
    // The production locale plugin registers the shared common vocabulary;
    // the test runtime starts bare, so add it for the bubble chrome labels.
    const locale = runtime.ctx.get('locale') as LocaleRuntime
    locale.register(COMMON_NS, 'zh', commonZh)
    const content = [{ type: 'text', text: 'editable bubble' }] as never
    await runtime.sessions.updateSnapshot(SID, (draft) => {
      draft.chat = chatSnapshotFixture({
        nodes: [
          { kind: 'user', seq: 7, time: 7_000, content, source: null },
          { kind: 'steering', messageId: 'steer-1', seq: 9, time: 9_000, turn: 1, content: [{ type: 'text', text: 'steer!' }], source: null },
        ] as never,
      })
    })
    // A plugin's per-message action: registers on the seat the user renderer
    // declared, and receives the message's durable seq + frozen content.
    runtime.slots.register({ name: 'conversation.chat.user-actions', id: 'probe' }, UserActionsProbe)
    const view = runtime.renderRoot()

    const probe = view.getByTestId('user-actions-probe')
    expect(probe.textContent).toBe('7:editable bubble')
    const userItem = probe.closest('[data-chat-flow-kind="user"]')
    expect(userItem).not.toBeNull()
    // extraActions lands inside the user row's IconActions strip, after copy.
    const copy = within(userItem as HTMLElement).getByRole('button', { name: '复制' })
    expect(copy.compareDocumentPosition(probe) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0)
    // The steering row keeps the same bubble chrome but no slot seat: no
    // anchor, so no action can attach to an admitted steering message.
    const steeringItem = view.container.querySelector('[data-chat-flow-kind="steering"]')
    expect(steeringItem).not.toBeNull()
    expect(steeringItem!.querySelector('[data-slot="conversation.chat.user-actions"]')).toBeNull()
    // Exactly one slot anchor in the whole tree: the user row only.
    expect(view.container.querySelectorAll('[data-slot="conversation.chat.user-actions"]')).toHaveLength(1)
    await runtime.dispose()
  })
})
