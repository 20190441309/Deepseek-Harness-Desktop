import { describe, expect, it, vi } from 'vitest'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import { formatInstallDraft, seedInstallDraft } from '../src/client/seed-install-draft.ts'

const TEMPLATE = '帮我安装 {repo}\n\n安装规格：{spec}'
const ITEM = { repo: 'dsh-loop', installSpec: 'github:owner/dsh-loop#abc' }

describe('formatInstallDraft', () => {
  it('fills repo and spec placeholders', () => {
    expect(formatInstallDraft(TEMPLATE, ITEM)).toBe('帮我安装 dsh-loop\n\n安装规格：github:owner/dsh-loop#abc')
  })
})

describe('seedInstallDraft', () => {
  const workspaceId = 'ws-1' as never
  const sessionId = 'sess-1' as never
  const scope = { id: 'scope' }

  function ctx(overrides: Record<string, unknown> = {}) {
    const setDraft = vi.fn()
    const open = vi.fn()
    const connectWorkspace = vi.fn(async () => sessionId)
    const base = {
      workspaces: {
        list: {
          getSnapshot: () => ({
            items: [{ workspaceId, sessionIds: ['sess-current'] }],
            recentWorkspaceId: workspaceId,
          }),
        },
        connectWorkspace,
      },
      sessions: {
        list: { getSnapshot: () => ({ current: 'sess-current' }) },
        open,
        scope: vi.fn(() => scope),
      },
      get: vi.fn(() => ({ input: { for: () => ({ setDraft }) } })),
      ...overrides,
    }
    return { ctx: base as unknown as ClientContext, raw: base, setDraft, open, connectWorkspace }
  }

  it('connects the workspace blank session, opens it, and writes the draft without submitting', async () => {
    const b = ctx()
    await expect(seedInstallDraft(b.ctx, ITEM, TEMPLATE)).resolves.toBe(sessionId)
    expect(b.connectWorkspace).toHaveBeenCalledWith(workspaceId)
    expect(b.open).toHaveBeenCalledWith(sessionId)
    expect(b.setDraft).toHaveBeenCalledWith('帮我安装 dsh-loop\n\n安装规格：github:owner/dsh-loop#abc')
  })

  it('falls back to the recent workspace when the current session is unaccounted', async () => {
    const recent = 'ws-recent' as never
    const connectRecent = vi.fn(async () => sessionId)
    const b = ctx({
      workspaces: {
        list: {
          getSnapshot: () => ({
            items: [{ workspaceId: recent, sessionIds: [] }],
            recentWorkspaceId: recent,
          }),
        },
        connectWorkspace: connectRecent,
      },
      sessions: {
        list: { getSnapshot: () => ({ current: 'sess-other' }) },
        open: vi.fn(),
        scope: vi.fn(() => scope),
      },
    })
    await seedInstallDraft(b.ctx, ITEM, TEMPLATE)
    expect(connectRecent).toHaveBeenCalledWith(recent)
  })

  it('fails loud when no workspace is registered', async () => {
    const connectNone = vi.fn(async () => sessionId)
    const b = ctx({
      workspaces: {
        list: { getSnapshot: () => ({ items: [], recentWorkspaceId: undefined }) },
        connectWorkspace: connectNone,
      },
      sessions: {
        list: { getSnapshot: () => ({ current: undefined }) },
        open: vi.fn(),
        scope: vi.fn(),
      },
    })
    await expect(seedInstallDraft(b.ctx, ITEM, TEMPLATE)).rejects.toThrow('no workspace to open')
    expect(connectNone).not.toHaveBeenCalled()
  })
})
