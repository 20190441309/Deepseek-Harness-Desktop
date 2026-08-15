// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { SessionId, SessionListState } from '@deepseek-ai/dsh-client-runtime/client'
import { FileTree, joinRel } from '../src/client/FileTree.tsx'
import type { FilePreviewProps } from '../src/client/FilePreview.tsx'
import { FilePreview } from '../src/client/FilePreview.tsx'
import type { FilesPanelProps } from '../src/client/FilesPanel.tsx'
import { FilesPanel } from '../src/client/FilesPanel.tsx'
import { en } from '../src/client/locales.ts'
import type { DirEntry, ListDirResult } from '../src/client/shell.ts'

const t: FilesPanelProps['t'] = key => (en as Record<string, string>)[key] ?? key
const neverHook = (() => { throw new Error('files must not read this hook') }) as never
const SID = 'session-files' as SessionId

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
          ...(cwd ? { cwd } : {}),
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

const FAKE_ROOT: DirEntry[] = [
  { name: 'src', kind: 'directory' },
  { name: 'README.md', kind: 'file' },
]

const FAKE_SRC: DirEntry[] = [
  { name: 'index.ts', kind: 'file' },
]

function listDirFake(cwd: string, relativePath: string): Promise<ListDirResult> {
  if (cwd !== '/tmp/proj') return Promise.resolve({ ok: false, message: 'missing' })
  if (relativePath === '' || relativePath === '.') {
    return Promise.resolve({ ok: true, entries: FAKE_ROOT })
  }
  if (relativePath === 'src') return Promise.resolve({ ok: true, entries: FAKE_SRC })
  return Promise.resolve({ ok: true, entries: [] })
}

afterEach(cleanup)

describe('FileTree', () => {
  it('renders a fake directory and opens a file on click', () => {
    const onOpenFile = vi.fn()
    const entries = FAKE_ROOT.map(entry => ({ ...entry, path: joinRel('', entry.name) }))
    render(
      <FileTree
        entries={entries}
        childrenByPath={{}}
        expanded={new Set()}
        onToggle={() => {}}
        onOpenFile={onOpenFile}
      />,
    )
    expect(screen.getByText('src')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /README.md/ }))
    expect(onOpenFile).toHaveBeenCalledWith('README.md')
  })
})

describe('FilesPanel', () => {
  it('lists a fake workspace and calls openFile for a file click', async () => {
    const openFile = vi.fn()
    const listDir = vi.fn(listDirFake)
    render(
      <FilesPanel
        sessionId={SID}
        useSession={neverHook}
        useSessions={sel => sel(sessionList('/tmp/proj'))}
        useWorkspaces={neverHook}
        useProjection={neverHook}
        useInput={neverHook}
        inputActions={undefined}
        openFile={openFile}
        listDir={listDir}
        readFile={async () => ({ ok: false })}
        t={t}
      />,
    )
    await waitFor(() => {
      expect(screen.getByText('README.md')).toBeTruthy()
    })
    expect(listDir).toHaveBeenCalledWith('/tmp/proj', '')
    fireEvent.click(screen.getByRole('button', { name: /README.md/ }))
    expect(openFile).toHaveBeenCalledWith('README.md')
  })

  it('shows the list error when listDir rejects', async () => {
    render(
      <FilesPanel
        sessionId={SID}
        useSession={neverHook}
        useSessions={sel => sel(sessionList('/tmp/proj'))}
        useWorkspaces={neverHook}
        useProjection={neverHook}
        useInput={neverHook}
        inputActions={undefined}
        openFile={() => {}}
        listDir={async () => { throw new Error('unknown id') }}
        readFile={async () => ({ ok: false })}
        t={t}
      />,
    )
    expect(await screen.findByText('Could not list the directory.')).toBeTruthy()
  })
})

describe('FilePreview', () => {
  it('shows the read error when readFile rejects', async () => {
    render(
      <FilePreview
        sessionId={SID}
        relativePath="README.md"
        useSession={neverHook}
        useSessions={sel => sel(sessionList('/tmp/proj'))}
        useWorkspaces={neverHook}
        useProjection={neverHook}
        useInput={neverHook}
        inputActions={undefined}
        listDir={async () => ({ ok: false })}
        readFile={async () => { throw new Error('unknown id') }}
        t={t as FilePreviewProps['t']}
      />,
    )
    expect(await screen.findByText('Could not read the file.')).toBeTruthy()
  })
})
