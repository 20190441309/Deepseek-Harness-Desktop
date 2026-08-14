// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { SessionId, SessionListState } from '@deepseek-ai/dsh-client-runtime/client'
import type { GitActionsProps } from '../src/client/GitActionsControl.tsx'
import { GitActionsControl } from '../src/client/GitActionsControl.tsx'
import type { VcsStatus } from '../src/client/git-logic.ts'
import { en } from '../src/client/locales.ts'

const SID = 'session-git' as SessionId
const t: GitActionsProps['t'] = key => (en as Record<string, string>)[key] ?? key
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
} = {}) {
  const gitStatus = opts.gitStatus ?? vi.fn(async () => opts.git ?? null)
  const gitCommit = vi.fn(async () => ({ ok: true }))
  const gitPush = vi.fn(async () => ({ ok: true }))
  const gitPull = vi.fn(async () => ({ ok: true }))
  const gitCreateChangeRequest = vi.fn(async () => ({ ok: true }))
  const openExternal = vi.fn(async () => true)
  render(
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
  return { gitStatus, gitCommit, gitPush, gitPull, gitCreateChangeRequest, openExternal }
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
})
