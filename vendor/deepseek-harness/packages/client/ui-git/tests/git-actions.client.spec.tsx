// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { SessionId, SessionListState } from '@deepseek-ai/dsh-client-runtime/client'
import type { GitActionsProps } from '../src/client/GitActionsControl.tsx'
import { GitActionsControl } from '../src/client/GitActionsControl.tsx'
import type { VcsStatus } from '../src/client/git-logic.ts'
import { en } from '../src/client/locales.ts'

const SID = 'session-git' as SessionId
const t: GitActionsProps['t'] = (key, params) => {
  const template = (en as Record<string, string>)[key] ?? key
  if (!params) return template
  return template.replace(/\{(\w+)\}/g, (match, name: string) => (
    name in params ? String(params[name]) : match
  ))
}
const neverWorkspaces = (() => { throw new Error('git actions must not read useWorkspaces') }) as never

function sessionList(cwd: string | undefined): SessionListState {
  const current = cwd === undefined ? undefined : SID
  const byId = current === undefined
    ? {}
    : {
        [SID]: {
          id: SID,
          displayTitle: 'proj',
          running: false,
          blank: false,
          updatedAt: 1,
          ...(cwd === '' ? {} : { cwd }),
        },
      }
  return {
    ids: current === undefined ? [] : [SID],
    byId,
    current,
    phase: 'ready',
    subagentsByParent: {},
    jobsBySession: {},
    currentAddress: undefined,
  }
}

function useSessionsStub(list: SessionListState): GitActionsProps['useSessions'] {
  return (sel) => sel(list)
}

function status(overrides: Partial<VcsStatus> = {}): VcsStatus {
  return {
    refName: 'feature/test',
    hasWorkingTreeChanges: false,
    hasUpstream: true,
    aheadCount: 0,
    behindCount: 0,
    pr: null,
    isDefaultRef: false,
    hasPrimaryRemote: true,
    ...overrides,
  }
}

function mount(opts: {
  cwd?: string | undefined
  git?: VcsStatus | null
  gitStatus?: GitActionsProps['gitStatus']
  gitCommit?: GitActionsProps['gitCommit']
  gitPush?: GitActionsProps['gitPush']
  gitPull?: GitActionsProps['gitPull']
  gitCreateChangeRequest?: GitActionsProps['gitCreateChangeRequest']
} = {}) {
  const gitStatus = opts.gitStatus ?? vi.fn(async () => opts.git ?? null)
  const gitCommit = opts.gitCommit ?? vi.fn(async () => ({ ok: true }))
  const gitPush = opts.gitPush ?? vi.fn(async () => ({ ok: true }))
  const gitPull = opts.gitPull ?? vi.fn(async () => ({ ok: true }))
  const gitCreateChangeRequest = opts.gitCreateChangeRequest ?? vi.fn(async () => ({ ok: true }))
  const openExternal = vi.fn(async () => true)
  const view = render(
    <GitActionsControl
      surfaces={0}
      terminalDrawer={0}
      useSessions={useSessionsStub(sessionList(opts.cwd))}
      useWorkspaces={neverWorkspaces}
      gitStatus={gitStatus}
      gitCommit={gitCommit}
      gitPush={gitPush}
      gitPull={gitPull}
      gitCreateChangeRequest={gitCreateChangeRequest}
      openExternal={openExternal}
      t={t}
    />,
  )
  return { gitStatus, gitCommit, gitPush, gitPull, gitCreateChangeRequest, openExternal, rerender: view.rerender }
}

afterEach(cleanup)

describe('GitActionsControl', () => {
  it('disables the main button when the current session has no cwd', () => {
    const b = mount({ cwd: undefined })
    const main = screen.getByRole<HTMLButtonElement>('button', { name: 'Commit' })
    expect(main.disabled).toBe(true)
    expect(b.gitStatus).not.toHaveBeenCalled()
  })

  it('disables the main button and shows the unavailable hint when status is null', async () => {
    mount({ cwd: '/work', git: null })
    const main = await screen.findByRole<HTMLButtonElement>('button', { name: 'Commit' })
    expect(main.disabled).toBe(true)
    fireEvent.focus(main)
    expect(await screen.findByText('Git status is unavailable.')).toBeTruthy()
  })

  it('labels the main button Commit & push when the default ref has local changes', async () => {
    mount({
      cwd: '/work',
      git: status({
        refName: 'main',
        hasWorkingTreeChanges: true,
        isDefaultRef: true,
      }),
    })
    expect((await screen.findByRole<HTMLButtonElement>('button', { name: 'Commit & push' })).disabled).toBe(false)
  })

  it('labels the main button Push when the default ref is clean and ahead', async () => {
    mount({
      cwd: '/work',
      git: status({
        refName: 'main',
        aheadCount: 2,
        isDefaultRef: true,
      }),
    })
    expect((await screen.findByRole<HTMLButtonElement>('button', { name: 'Push' })).disabled).toBe(false)
  })

  it('opens a menu with Commit, Push, and Create PR', async () => {
    mount({
      cwd: '/work',
      git: status({ aheadCount: 2 }),
    })
    await screen.findByRole('button', { name: 'Push & create PR' })
    fireEvent.click(screen.getByRole('button', { name: 'Git actions' }))
    expect(await screen.findByRole('menuitem', { name: 'Commit' })).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: 'Push' })).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: 'Create PR' })).toBeTruthy()
  })

  it('asks for confirmation before pushing on the default ref', async () => {
    const b = mount({
      cwd: '/work',
      git: status({
        refName: 'main',
        aheadCount: 2,
        isDefaultRef: true,
      }),
    })
    fireEvent.click(await screen.findByRole('button', { name: 'Push' }))
    expect(await screen.findByRole('dialog', { name: 'Push to default ref?' })).toBeTruthy()
    expect(b.gitPush).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Push to main' }))
    await waitFor(() => { expect(b.gitPush).toHaveBeenCalledWith('/work') })
  })

  it('keeps a stable useSessions hook count when a session cwd appears', async () => {
    const gitStatus = vi.fn(async () => status({ aheadCount: 2 }))
    const shared = {
      surfaces: 0,
      terminalDrawer: 0,
      useWorkspaces: neverWorkspaces,
      gitStatus,
      gitCommit: vi.fn(async () => ({ ok: true })),
      gitPush: vi.fn(async () => ({ ok: true })),
      gitPull: vi.fn(async () => ({ ok: true })),
      gitCreateChangeRequest: vi.fn(async () => ({ ok: true })),
      openExternal: vi.fn(async () => true),
      t,
    } satisfies Omit<GitActionsProps, 'useSessions'>
    const { rerender } = render(
      <GitActionsControl {...shared} useSessions={useSessionsStub(sessionList(undefined))} />,
    )
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Commit' }).disabled).toBe(true)
    expect(gitStatus).not.toHaveBeenCalled()
    rerender(
      <GitActionsControl {...shared} useSessions={useSessionsStub(sessionList('/work'))} />,
    )
    expect(await screen.findByRole('button', { name: 'Push & create PR' })).toBeTruthy()
  })

  it('shows the IPC failure message in a dialog', async () => {
    const gitPush = vi.fn(async () => ({ ok: false, message: 'origin rejected the push.' }))
    mount({
      cwd: '/work',
      git: status({
        refName: 'main',
        aheadCount: 2,
        isDefaultRef: true,
      }),
      gitPush,
    })
    fireEvent.click(await screen.findByRole('button', { name: 'Push' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Push to main' }))
    expect(await screen.findByRole('dialog', { name: 'Action failed' })).toBeTruthy()
    expect(screen.getByText('origin rejected the push.')).toBeTruthy()
  })

  it('refreshes git status on window focus', async () => {
    const gitStatus = vi.fn(async () => status({ aheadCount: 2 }))
    mount({ cwd: '/work', gitStatus })
    await waitFor(() => { expect(gitStatus).toHaveBeenCalledTimes(1) })
    fireEvent(window, new Event('focus'))
    await waitFor(() => { expect(gitStatus).toHaveBeenCalledTimes(2) })
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
    fireEvent(document, new Event('visibilitychange'))
    await waitFor(() => { expect(gitStatus).toHaveBeenCalledTimes(3) })
  })

  it('disables Publish repository and shows the unavailable hint', async () => {
    mount({
      cwd: '/work',
      git: status({
        hasUpstream: false,
        hasPrimaryRemote: false,
      }),
    })
    const main = await screen.findByRole<HTMLButtonElement>('button', { name: 'Publish repository' })
    expect(main.disabled).toBe(true)
    fireEvent.focus(main)
    expect(await screen.findByText('Publish repository is unavailable.')).toBeTruthy()
  })
})
