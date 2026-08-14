// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import type { SessionId, SessionListState } from '@deepseek-ai/dsh-client-runtime/client'
import type { DiffPanelProps } from '../src/client/DiffPanel.tsx'
import { DiffPanel } from '../src/client/DiffPanel.tsx'
import { en } from '../src/client/locales.ts'
import type { GitDiffResult } from '../src/client/shell.ts'

const t: DiffPanelProps['t'] = key => (en as Record<string, string>)[key] ?? key
const neverHook = (() => { throw new Error('diff must not read this hook') }) as never
const SID = 'session-diff' as SessionId

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
          cwd,
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

const SAMPLE: GitDiffResult = {
  files: [{
    path: 'README.md',
    status: 'modified',
    hunks: [{
      header: '@@ -1,1 +1,2 @@',
      lines: [
        { kind: 'context', text: 'hello' },
        { kind: 'add', text: 'world' },
      ],
    }],
  }],
}

function mount(opts: {
  cwd?: string
  status?: unknown | null
  diff?: GitDiffResult | null
}) {
  const gitStatus = vi.fn(async () => opts.status ?? null)
  const gitDiff = vi.fn(async () => opts.diff ?? null)
  render(
    <DiffPanel
      sessionId={SID}
      useSession={neverHook}
      useSessions={sel => sel(sessionList(opts.cwd))}
      useWorkspaces={neverHook}
      useProjection={neverHook}
      gitStatus={gitStatus}
      gitDiff={gitDiff}
      t={t}
    />,
  )
  return { gitStatus, gitDiff }
}

afterEach(cleanup)

describe('DiffPanel', () => {
  it('shows the T3code reason when the workspace is not a git repository', async () => {
    mount({ cwd: '/tmp/plain', status: null, diff: null })
    await waitFor(() => {
      expect(screen.getByText('Diff is only available for server threads in Git repositories.')).toBeTruthy()
    })
    expect(screen.queryByText('README.md')).toBeNull()
  })

  it('renders the change list and hunks when gitStatus and gitDiff succeed', async () => {
    mount({ cwd: '/tmp/repo', status: { refName: 'main' }, diff: SAMPLE })
    await waitFor(() => {
      expect(screen.getByText('README.md')).toBeTruthy()
    })
    expect(screen.getByText('@@ -1,1 +1,2 @@')).toBeTruthy()
    expect(screen.getByText('world')).toBeTruthy()
  })
})
