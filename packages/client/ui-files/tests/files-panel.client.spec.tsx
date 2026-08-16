// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, act } from '@testing-library/react'
import { writeClipboard } from '@deepseek-ai/dsh-client-ui-primitives'

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@deepseek-ai/dsh-client-ui-primitives')>()
  return { ...actual, writeClipboard: vi.fn(async () => true) }
})
import type { SessionId, SessionListState } from '@deepseek-ai/dsh-client-runtime/client'
import { filterEntries } from '../src/client/filter.ts'
import { FileTree, joinRel } from '../src/client/FileTree.tsx'
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

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('filterEntries', () => {
  it('keeps ancestor directories of a name match', () => {
    const src = { name: 'src', kind: 'directory' as const, path: 'src' }
    const readme = { name: 'README.md', kind: 'file' as const, path: 'README.md' }
    const index = { name: 'index.ts', kind: 'file' as const, path: 'src/index.ts' }
    expect(filterEntries([src, readme], 'index', { src: [index] }).map(entry => entry.path)).toEqual(['src'])
    expect(filterEntries([src, readme], '', { src: [index] })).toHaveLength(2)
  })
})

describe('FileTree', () => {
  it('renders a fake directory and opens a file on click', () => {
    const onOpenFile = vi.fn()
    const onMention = vi.fn()
    const onCopyRelative = vi.fn()
    const onCopyAbsolute = vi.fn()
    const entries = FAKE_ROOT.map(entry => ({ ...entry, path: joinRel('', entry.name) }))
    render(
      <FileTree
        entries={entries}
        childrenByPath={{}}
        expanded={new Set()}
        onToggle={() => {}}
        onOpenFile={onOpenFile}
        onMention={onMention}
        onCopyRelative={onCopyRelative}
        onCopyAbsolute={onCopyAbsolute}
        mentionLabel="Mention in composer"
        copyRelativeLabel="Copy relative path"
        copyAbsoluteLabel="Copy absolute path"
      />,
    )
    expect(screen.getByText('src')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /README.md/ }))
    expect(onOpenFile).toHaveBeenCalledWith('README.md')
    fireEvent.click(screen.getByRole('button', { name: 'Mention in composer' }))
    expect(onMention).toHaveBeenCalledWith('README.md')
    fireEvent.contextMenu(screen.getByRole('button', { name: /README.md/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Copy relative path' }))
    expect(onCopyRelative).toHaveBeenCalledWith('README.md')
    fireEvent.contextMenu(screen.getByRole('button', { name: /README.md/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Copy absolute path' }))
    expect(onCopyAbsolute).toHaveBeenCalledWith('README.md')
    fireEvent.contextMenu(screen.getByRole('button', { name: /README.md/ }))
    fireEvent.keyDown(document, { key: 'Escape' })
  })

  it('skips the context menu when copy actions are absent', () => {
    const entries = FAKE_ROOT.map(entry => ({ ...entry, path: joinRel('', entry.name) }))
    render(
      <FileTree
        entries={entries}
        childrenByPath={{}}
        expanded={new Set()}
        onToggle={() => {}}
        onOpenFile={() => {}}
      />,
    )
    fireEvent.contextMenu(screen.getByRole('button', { name: /README.md/ }))
    expect(screen.queryByRole('menu')).toBeNull()
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
        readFileMedia={async () => ({ ok: false })}
        mentionFile={() => {}}
        writeFile={async () => ({ ok: true })}
        t={t}
      />,
    )
    await waitFor(() => {
      expect(screen.getByText('README.md')).toBeTruthy()
    })
    expect(listDir).toHaveBeenCalledWith('/tmp/proj', '')
    fireEvent.click(screen.getByRole('button', { name: /README.md/ }))
    expect(openFile).toHaveBeenCalledWith('README.md')
    fireEvent.click(screen.getByRole('button', { name: /src/ }))
    await waitFor(() => {
      expect(listDir).toHaveBeenCalledWith('/tmp/proj', 'src')
    })
    await waitFor(() => {
      expect(screen.getByText('index.ts')).toBeTruthy()
    })
    fireEvent.click(screen.getByRole('button', { name: /index.ts/ }))
    expect(openFile).toHaveBeenCalledWith('src/index.ts')
    fireEvent.click(screen.getByRole('button', { name: /src/ }))
    fireEvent.click(screen.getByRole('button', { name: /src/ }))
    expect(screen.getByText('index.ts')).toBeTruthy()
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
        readFileMedia={async () => ({ ok: false })}
        mentionFile={() => {}}
        writeFile={async () => ({ ok: true })}
        t={t}
      />,
    )
    expect(await screen.findByText('Could not list the directory.')).toBeTruthy()
  })

  it('mentions a file and refreshes the tree', async () => {
    const mentionFile = vi.fn()
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
        openFile={() => {}}
        listDir={listDir}
        readFile={async () => ({ ok: false })}
        readFileMedia={async () => ({ ok: false })}
        mentionFile={mentionFile}
        writeFile={async () => ({ ok: true })}
        t={t}
      />,
    )
    await waitFor(() => {
      expect(screen.getByText('README.md')).toBeTruthy()
    })
    fireEvent.click(screen.getByRole('button', { name: 'Mention in composer' }))
    expect(mentionFile).toHaveBeenCalledWith(SID, 'README.md')
    expect(screen.queryByRole('heading')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    await waitFor(() => {
      expect(listDir.mock.calls.length).toBeGreaterThan(1)
    })
  })

  it('copies relative and absolute paths from the context menu', async () => {
    vi.mocked(writeClipboard).mockClear()
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
        listDir={listDirFake}
        readFile={async () => ({ ok: false })}
        readFileMedia={async () => ({ ok: false })}
        mentionFile={() => {}}
        writeFile={async () => ({ ok: true })}
        t={t}
      />,
    )
    await waitFor(() => {
      expect(screen.getByText('README.md')).toBeTruthy()
    })
    fireEvent.contextMenu(screen.getByRole('button', { name: /README.md/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Copy relative path' }))
    await waitFor(() => {
      expect(writeClipboard).toHaveBeenCalledWith('README.md')
    })
    fireEvent.contextMenu(screen.getByRole('button', { name: /README.md/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Copy absolute path' }))
    await waitFor(() => {
      expect(writeClipboard).toHaveBeenCalledWith('/tmp/proj/README.md')
    })
    vi.useFakeTimers()
    fireEvent.contextMenu(screen.getByRole('button', { name: /README.md/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Copy relative path' }))
    await act(async () => {
      await Promise.resolve()
      vi.advanceTimersByTime(1200)
    })
    vi.useRealTimers()
  })

  it('shows the empty-cwd message when no workspace is attached', () => {
    render(
      <FilesPanel
        sessionId={SID}
        useSession={neverHook}
        useSessions={sel => sel(sessionList(undefined))}
        useWorkspaces={neverHook}
        useProjection={neverHook}
        useInput={neverHook}
        inputActions={undefined}
        openFile={() => {}}
        listDir={async () => ({ ok: false })}
        readFile={async () => ({ ok: false })}
        readFileMedia={async () => ({ ok: false })}
        mentionFile={() => {}}
        writeFile={async () => ({ ok: true })}
        t={t}
      />,
    )
    expect(screen.getByText('A workspace is required to browse files.')).toBeTruthy()
  })

  it('shows the empty-directory message when listing returns no entries', async () => {
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
        listDir={async () => ({ ok: true, entries: [] })}
        readFile={async () => ({ ok: false })}
        readFileMedia={async () => ({ ok: false })}
        mentionFile={() => {}}
        writeFile={async () => ({ ok: true })}
        t={t}
      />,
    )
    expect(await screen.findByText('This directory is empty.')).toBeTruthy()
    cleanup()
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
        listDir={async () => ({ ok: true })}
        readFile={async () => ({ ok: false })}
        readFileMedia={async () => ({ ok: false })}
        mentionFile={() => {}}
        writeFile={async () => ({ ok: true })}
        t={t}
      />,
    )
    expect(await screen.findByText('This directory is empty.')).toBeTruthy()
  })

  it('shows the list message when listDir returns not-ok', async () => {
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
        listDir={async () => ({ ok: false, message: 'denied' })}
        readFile={async () => ({ ok: false })}
        readFileMedia={async () => ({ ok: false })}
        mentionFile={() => {}}
        writeFile={async () => ({ ok: true })}
        t={t}
      />,
    )
    expect(await screen.findByText('denied')).toBeTruthy()
  })

  it('does not mention without a session and reports a child-list error', async () => {
    vi.mocked(writeClipboard).mockResolvedValueOnce(false)
    const mentionFile = vi.fn()
    render(
      <FilesPanel
        sessionId={undefined}
        useSession={neverHook}
        useSessions={sel => sel(sessionList('/tmp/proj'))}
        useWorkspaces={neverHook}
        useProjection={neverHook}
        useInput={neverHook}
        inputActions={undefined}
        openFile={() => {}}
        listDir={async (_cwd, relativePath) => {
          if (relativePath === 'src') return { ok: false }
          return listDirFake('/tmp/proj', relativePath)
        }}
        readFile={async () => ({ ok: false })}
        readFileMedia={async () => ({ ok: false })}
        mentionFile={mentionFile}
        writeFile={async () => ({ ok: true })}
        t={t}
      />,
    )
    await waitFor(() => {
      expect(screen.getByText('README.md')).toBeTruthy()
    })
    expect(screen.queryByRole('button', { name: 'Mention in composer' })).toBeNull()
    fireEvent.contextMenu(screen.getByRole('button', { name: /README.md/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Copy relative path' }))
    fireEvent.click(screen.getByRole('button', { name: /src/ }))
    expect(await screen.findByText('Could not list the directory.')).toBeTruthy()
  })

  it('surfaces a thrown child listing error', async () => {
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
        listDir={async (_cwd, relativePath) => {
          if (relativePath === 'src') throw new Error('boom')
          return listDirFake('/tmp/proj', relativePath)
        }}
        readFile={async () => ({ ok: false })}
        readFileMedia={async () => ({ ok: false })}
        mentionFile={() => {}}
        writeFile={async () => ({ ok: true })}
        t={t}
      />,
    )
    await waitFor(() => {
      expect(screen.getByText('README.md')).toBeTruthy()
    })
    fireEvent.click(screen.getByRole('button', { name: /src/ }))
    expect(await screen.findByText('Could not list the directory.')).toBeTruthy()
  })

  it('ignores a late listDir, uses fallback copy, and expands empty children', async () => {
    let finish!: (value: ListDirResult) => void
    const pending = new Promise<ListDirResult>((resolve) => { finish = resolve })
    const { unmount } = render(
      <FilesPanel
        sessionId={SID}
        useSession={neverHook}
        useSessions={sel => sel(sessionList('/tmp/proj'))}
        useWorkspaces={neverHook}
        useProjection={neverHook}
        useInput={neverHook}
        inputActions={undefined}
        openFile={() => {}}
        listDir={() => pending}
        readFile={async () => ({ ok: false })}
        readFileMedia={async () => ({ ok: false })}
        mentionFile={() => {}}
        writeFile={async () => ({ ok: true })}
        t={t}
      />,
    )
    unmount()
    finish({ ok: true, entries: FAKE_ROOT })
    let fail!: (error: Error) => void
    const rejecting = new Promise<ListDirResult>((_, reject) => { fail = reject })
    const { unmount: unmountReject } = render(
      <FilesPanel
        sessionId={SID}
        useSession={neverHook}
        useSessions={sel => sel(sessionList('/tmp/proj'))}
        useWorkspaces={neverHook}
        useProjection={neverHook}
        useInput={neverHook}
        inputActions={undefined}
        openFile={() => {}}
        listDir={() => rejecting}
        readFile={async () => ({ ok: false })}
        readFileMedia={async () => ({ ok: false })}
        mentionFile={() => {}}
        writeFile={async () => ({ ok: true })}
        t={t}
      />,
    )
    unmountReject()
    fail(new Error('late'))
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
        listDir={async (_cwd, relativePath) => {
          if (relativePath === 'src') return { ok: true }
          if (relativePath === '') return { ok: false }
          return { ok: false }
        }}
        readFile={async () => ({ ok: false })}
        readFileMedia={async () => ({ ok: false })}
        mentionFile={() => {}}
        writeFile={async () => ({ ok: true })}
        t={t}
      />,
    )
    expect(await screen.findByText('Could not list the directory.')).toBeTruthy()
    cleanup()
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
        listDir={async (_cwd, relativePath) => {
          if (relativePath === '') return { ok: true, entries: FAKE_ROOT }
          return { ok: true }
        }}
        readFile={async () => ({ ok: false })}
        readFileMedia={async () => ({ ok: false })}
        mentionFile={() => {}}
        writeFile={async () => ({ ok: true })}
        t={t}
      />,
    )
    await waitFor(() => {
      expect(screen.getByText('src')).toBeTruthy()
    })
    fireEvent.click(screen.getByRole('button', { name: /src/ }))
    fireEvent.click(screen.getByRole('button', { name: /src/ }))
    expect(screen.getByText('src')).toBeTruthy()
  })

  it('filters the tree from the search field and clears on Escape', async () => {
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
        listDir={listDirFake}
        readFile={async () => ({ ok: false })}
        readFileMedia={async () => ({ ok: false })}
        mentionFile={() => {}}
        writeFile={async () => ({ ok: true })}
        t={t}
      />,
    )
    await waitFor(() => {
      expect(screen.getByText('README.md')).toBeTruthy()
    })
    fireEvent.change(screen.getByLabelText('Search files'), { target: { value: 'README' } })
    await waitFor(() => {
      expect(screen.queryByText('src')).toBeNull()
    })
    fireEvent.keyDown(screen.getByLabelText('Search files'), { key: 'Escape' })
    await waitFor(() => {
      expect(screen.getByText('src')).toBeTruthy()
    })
  })

  it('re-walks an active search on refresh instead of dropping nested matches', async () => {
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
        openFile={() => {}}
        listDir={listDir}
        readFile={async () => ({ ok: false })}
        readFileMedia={async () => ({ ok: false })}
        mentionFile={() => {}}
        writeFile={async () => ({ ok: true })}
        t={t}
      />,
    )
    await waitFor(() => {
      expect(screen.getByText('README.md')).toBeTruthy()
    })
    fireEvent.change(screen.getByLabelText('Search files'), { target: { value: 'index' } })
    expect(await screen.findByText('index.ts')).toBeTruthy()
    const callsBefore = listDir.mock.calls.length
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    await waitFor(() => {
      expect(listDir.mock.calls.length).toBeGreaterThan(callsBefore)
    })
    expect(screen.getByText('index.ts')).toBeTruthy()
  })

  it('reports when the search walk hits the depth budget', async () => {
    const deepList: FilesPanelProps['listDir'] = async (_cwd, relativePath) => {
      const depth = relativePath === '' ? 0 : relativePath.split('/').length
      if (depth >= 12) return { ok: true, entries: [{ name: 'leaf.txt', kind: 'file' }] }
      return { ok: true, entries: [{ name: `d${depth}`, kind: 'directory' }] }
    }
    render(
      <FilesPanel
        sessionId={SID}
        useSession={neverHook}
        useSessions={sel => sel(sessionList('/tmp/deep'))}
        useWorkspaces={neverHook}
        useProjection={neverHook}
        useInput={neverHook}
        inputActions={undefined}
        openFile={() => {}}
        listDir={deepList}
        readFile={async () => ({ ok: false })}
        readFileMedia={async () => ({ ok: false })}
        mentionFile={() => {}}
        writeFile={async () => ({ ok: true })}
        t={t}
      />,
    )
    await waitFor(() => {
      expect(screen.getByText('d0')).toBeTruthy()
    })
    fireEvent.change(screen.getByLabelText('Search files'), { target: { value: 'leaf' } })
    expect(await screen.findByText('Search stopped early (depth or directory limit).')).toBeTruthy()
  })
})

describe('FilePreview', () => {
  it('shows the read error when readFile rejects', async () => {
    render(
      <FilePreview
        sessionId={SID}
        relativePath="README.md"
        active
        onDirtyChange={() => {}}
        registerSave={() => {}}
        readBuffer={() => undefined}
        writeBuffer={() => {}}
        useSession={neverHook}
        useSessions={sel => sel(sessionList('/tmp/proj'))}
        useWorkspaces={neverHook}
        useProjection={neverHook}
        useInput={neverHook}
        inputActions={undefined}
        listDir={async () => ({ ok: false })}
        readFile={async () => { throw new Error('unknown id') }}
        readFileMedia={async () => ({ ok: false })}
        mentionFile={() => {}}
        writeFile={async () => ({ ok: true })}
        t={t}
      />,
    )
    expect(await screen.findByText('Could not read the file.')).toBeTruthy()
  })

  it('renders markdown with codeLabels and images from readFileMedia', async () => {
    const { rerender } = render(
      <FilePreview
        sessionId={SID}
        relativePath="note.md"
        active
        onDirtyChange={() => {}}
        registerSave={() => {}}
        readBuffer={() => undefined}
        writeBuffer={() => {}}
        useSession={neverHook}
        useSessions={sel => sel(sessionList('/tmp/proj'))}
        useWorkspaces={neverHook}
        useProjection={neverHook}
        useInput={neverHook}
        inputActions={undefined}
        listDir={async () => ({ ok: false })}
        readFile={async () => ({ ok: true, text: '# Hello', binary: false })}
        readFileMedia={async () => ({ ok: false })}
        mentionFile={() => {}}
        writeFile={async () => ({ ok: true })}
        t={t}
      />,
    )
    expect(await screen.findByText('Hello')).toBeTruthy()
    rerender(
      <FilePreview
        sessionId={SID}
        relativePath="icon.png"
        active
        onDirtyChange={() => {}}
        registerSave={() => {}}
        readBuffer={() => undefined}
        writeBuffer={() => {}}
        useSession={neverHook}
        useSessions={sel => sel(sessionList('/tmp/proj'))}
        useWorkspaces={neverHook}
        useProjection={neverHook}
        useInput={neverHook}
        inputActions={undefined}
        listDir={async () => ({ ok: false })}
        readFile={async () => ({ ok: false })}
        readFileMedia={async () => ({ ok: true, mime: 'image/png', base64: 'aaaa' })}
        mentionFile={() => {}}
        writeFile={async () => ({ ok: true })}
        t={t}
      />,
    )
    const image = await screen.findByRole('img', { name: 'icon.png' })
    expect(image.getAttribute('src')).toBe('data:image/png;base64,aaaa')
  })

  it('shows the binary stub and the empty-cwd message', async () => {
    render(
      <FilePreview
        sessionId={SID}
        relativePath="blob.bin"
        active
        onDirtyChange={() => {}}
        registerSave={() => {}}
        readBuffer={() => undefined}
        writeBuffer={() => {}}
        useSession={neverHook}
        useSessions={sel => sel(sessionList(undefined))}
        useWorkspaces={neverHook}
        useProjection={neverHook}
        useInput={neverHook}
        inputActions={undefined}
        listDir={async () => ({ ok: false })}
        readFile={async () => ({ ok: true, binary: true, text: '' })}
        readFileMedia={async () => ({ ok: false })}
        mentionFile={() => {}}
        writeFile={async () => ({ ok: true })}
        t={t}
      />,
    )
    expect(await screen.findByText('A workspace is required to browse files.')).toBeTruthy()
  })

  it('shows truncated text, binary stub, and media errors', async () => {
    const { rerender } = render(
      <FilePreview
        sessionId={SID}
        relativePath="src/a.ts"
        active
        onDirtyChange={() => {}}
        registerSave={() => {}}
        readBuffer={() => undefined}
        writeBuffer={() => {}}
        useSession={neverHook}
        useSessions={sel => sel(sessionList('/tmp/proj'))}
        useWorkspaces={neverHook}
        useProjection={neverHook}
        useInput={neverHook}
        inputActions={undefined}
        listDir={async () => ({ ok: false })}
        readFile={async () => ({ ok: true, text: 'const x = 1', binary: false, truncated: true })}
        readFileMedia={async () => ({ ok: false })}
        mentionFile={() => {}}
        writeFile={async () => ({ ok: true })}
        t={t}
      />,
    )
    expect(await screen.findByText('File is too large; showing the beginning.')).toBeTruthy()
    expect(screen.getByText('src/a.ts')).toBeTruthy()
    expect(screen.queryByRole('heading')).toBeNull()
    expect(screen.getByText('const x = 1')).toBeTruthy()
    rerender(
      <FilePreview
        sessionId={SID}
        relativePath="blob.bin"
        active
        onDirtyChange={() => {}}
        registerSave={() => {}}
        readBuffer={() => undefined}
        writeBuffer={() => {}}
        useSession={neverHook}
        useSessions={sel => sel(sessionList('/tmp/proj'))}
        useWorkspaces={neverHook}
        useProjection={neverHook}
        useInput={neverHook}
        inputActions={undefined}
        listDir={async () => ({ ok: false })}
        readFile={async () => ({ ok: true, binary: true, text: '' })}
        readFileMedia={async () => ({ ok: false })}
        mentionFile={() => {}}
        writeFile={async () => ({ ok: true })}
        t={t}
      />,
    )
    expect(await screen.findByText('This binary file cannot be previewed.')).toBeTruthy()
    rerender(
      <FilePreview
        sessionId={SID}
        relativePath="icon.png"
        active
        onDirtyChange={() => {}}
        registerSave={() => {}}
        readBuffer={() => undefined}
        writeBuffer={() => {}}
        useSession={neverHook}
        useSessions={sel => sel(sessionList('/tmp/proj'))}
        useWorkspaces={neverHook}
        useProjection={neverHook}
        useInput={neverHook}
        inputActions={undefined}
        listDir={async () => ({ ok: false })}
        readFile={async () => ({ ok: false })}
        readFileMedia={async () => ({ ok: false, message: 'too large' })}
        mentionFile={() => {}}
        writeFile={async () => ({ ok: true })}
        t={t}
      />,
    )
    expect(await screen.findByText('too large')).toBeTruthy()
  })

  it('ignores a late read after unmount and surfaces media failures', async () => {
    let finish!: (value: { ok: true; text: string; binary: false }) => void
    const pending = new Promise<{ ok: true; text: string; binary: false }>((resolve) => {
      finish = resolve
    })
    const { unmount } = render(
      <FilePreview
        sessionId={SID}
        relativePath="late.ts"
        active
        onDirtyChange={() => {}}
        registerSave={() => {}}
        readBuffer={() => undefined}
        writeBuffer={() => {}}
        useSession={neverHook}
        useSessions={sel => sel(sessionList('/tmp/proj'))}
        useWorkspaces={neverHook}
        useProjection={neverHook}
        useInput={neverHook}
        inputActions={undefined}
        listDir={async () => ({ ok: false })}
        readFile={() => pending}
        readFileMedia={async () => ({ ok: false })}
        mentionFile={() => {}}
        writeFile={async () => ({ ok: true })}
        t={t}
      />,
    )
    unmount()
    finish({ ok: true, text: 'late', binary: false })
    const { rerender } = render(
      <FilePreview
        sessionId={SID}
        relativePath="icon.png"
        active
        onDirtyChange={() => {}}
        registerSave={() => {}}
        readBuffer={() => undefined}
        writeBuffer={() => {}}
        useSession={neverHook}
        useSessions={sel => sel(sessionList('/tmp/proj'))}
        useWorkspaces={neverHook}
        useProjection={neverHook}
        useInput={neverHook}
        inputActions={undefined}
        listDir={async () => ({ ok: false })}
        readFile={async () => ({ ok: false })}
        readFileMedia={async () => { throw new Error('media') }}
        mentionFile={() => {}}
        writeFile={async () => ({ ok: true })}
        t={t}
      />,
    )
    expect(await screen.findByText('Could not read the file.')).toBeTruthy()
    rerender(
      <FilePreview
        sessionId={SID}
        relativePath="photo.jpg"
        active
        onDirtyChange={() => {}}
        registerSave={() => {}}
        readBuffer={() => undefined}
        writeBuffer={() => {}}
        useSession={neverHook}
        useSessions={sel => sel(sessionList('/tmp/proj'))}
        useWorkspaces={neverHook}
        useProjection={neverHook}
        useInput={neverHook}
        inputActions={undefined}
        listDir={async () => ({ ok: false })}
        readFile={async () => ({ ok: false })}
        readFileMedia={async () => ({ ok: true, mime: 'image/jpeg', base64: 'bb', truncated: true })}
        mentionFile={() => {}}
        writeFile={async () => ({ ok: true })}
        t={t}
      />,
    )
    expect(await screen.findByText('File is too large; showing the beginning.')).toBeTruthy()
    rerender(
      <FilePreview
        sessionId={SID}
        relativePath="note.md"
        active
        onDirtyChange={() => {}}
        registerSave={() => {}}
        readBuffer={() => undefined}
        writeBuffer={() => {}}
        useSession={neverHook}
        useSessions={sel => sel(sessionList('/tmp/proj'))}
        useWorkspaces={neverHook}
        useProjection={neverHook}
        useInput={neverHook}
        inputActions={undefined}
        listDir={async () => ({ ok: false })}
        readFile={async () => ({ ok: true, text: '# Hi', binary: false, truncated: true })}
        readFileMedia={async () => ({ ok: false })}
        mentionFile={() => {}}
        writeFile={async () => ({ ok: true })}
        t={t}
      />,
    )
    expect(await screen.findByText('File is too large; showing the beginning.')).toBeTruthy()
    rerender(
      <FilePreview
        sessionId={SID}
        relativePath="missing.ts"
        active
        onDirtyChange={() => {}}
        registerSave={() => {}}
        readBuffer={() => undefined}
        writeBuffer={() => {}}
        useSession={neverHook}
        useSessions={sel => sel(sessionList('/tmp/proj'))}
        useWorkspaces={neverHook}
        useProjection={neverHook}
        useInput={neverHook}
        inputActions={undefined}
        listDir={async () => ({ ok: false })}
        readFile={async () => ({ ok: false })}
        readFileMedia={async () => ({ ok: false })}
        mentionFile={() => {}}
        writeFile={async () => ({ ok: true })}
        t={t}
      />,
    )
    expect(await screen.findByText('Could not read the file.')).toBeTruthy()
  })

  it('previews a file with no extension', async () => {
    render(
      <FilePreview
        sessionId={SID}
        relativePath="LICENSE"
        active
        onDirtyChange={() => {}}
        registerSave={() => {}}
        readBuffer={() => undefined}
        writeBuffer={() => {}}
        useSession={neverHook}
        useSessions={sel => sel(sessionList('/tmp/proj'))}
        useWorkspaces={neverHook}
        useProjection={neverHook}
        useInput={neverHook}
        inputActions={undefined}
        listDir={async () => ({ ok: false })}
        readFile={async () => ({ ok: true, text: 'mit', binary: false })}
        readFileMedia={async () => ({ ok: false })}
        mentionFile={() => {}}
        writeFile={async () => ({ ok: true })}
        t={t}
      />,
    )
    expect(await screen.findByDisplayValue('mit')).toBeTruthy()
  })

  it('ignores a late image read and falls back when media or text fields are missing', async () => {
    let finish!: (value: { ok: true; mime: string; base64: string }) => void
    const pending = new Promise<{ ok: true; mime: string; base64: string }>((resolve) => {
      finish = resolve
    })
    const { unmount } = render(
      <FilePreview
        sessionId={SID}
        relativePath="icon.png"
        active
        onDirtyChange={() => {}}
        registerSave={() => {}}
        readBuffer={() => undefined}
        writeBuffer={() => {}}
        useSession={neverHook}
        useSessions={sel => sel(sessionList('/tmp/proj'))}
        useWorkspaces={neverHook}
        useProjection={neverHook}
        useInput={neverHook}
        inputActions={undefined}
        listDir={async () => ({ ok: false })}
        readFile={async () => ({ ok: false })}
        readFileMedia={() => pending}
        mentionFile={() => {}}
        writeFile={async () => ({ ok: true })}
        t={t}
      />,
    )
    unmount()
    finish({ ok: true, mime: 'image/png', base64: 'late' })
    let fail!: (error: Error) => void
    const rejecting = new Promise<never>((_, reject) => { fail = reject })
    const { unmount: unmountReject } = render(
      <FilePreview
        sessionId={SID}
        relativePath="icon.png"
        active
        onDirtyChange={() => {}}
        registerSave={() => {}}
        readBuffer={() => undefined}
        writeBuffer={() => {}}
        useSession={neverHook}
        useSessions={sel => sel(sessionList('/tmp/proj'))}
        useWorkspaces={neverHook}
        useProjection={neverHook}
        useInput={neverHook}
        inputActions={undefined}
        listDir={async () => ({ ok: false })}
        readFile={async () => ({ ok: false })}
        readFileMedia={() => rejecting}
        mentionFile={() => {}}
        writeFile={async () => ({ ok: true })}
        t={t}
      />,
    )
    unmountReject()
    fail(new Error('late-media'))
    let failText!: (error: Error) => void
    const rejectingText = new Promise<never>((_, reject) => { failText = reject })
    const { unmount: unmountText } = render(
      <FilePreview
        sessionId={SID}
        relativePath="a.ts"
        active
        onDirtyChange={() => {}}
        registerSave={() => {}}
        readBuffer={() => undefined}
        writeBuffer={() => {}}
        useSession={neverHook}
        useSessions={sel => sel(sessionList('/tmp/proj'))}
        useWorkspaces={neverHook}
        useProjection={neverHook}
        useInput={neverHook}
        inputActions={undefined}
        listDir={async () => ({ ok: false })}
        readFile={() => rejectingText}
        readFileMedia={async () => ({ ok: false })}
        mentionFile={() => {}}
        writeFile={async () => ({ ok: true })}
        t={t}
      />,
    )
    unmountText()
    failText(new Error('late-text'))
    const { rerender } = render(
      <FilePreview
        sessionId={SID}
        relativePath="icon.png"
        active
        onDirtyChange={() => {}}
        registerSave={() => {}}
        readBuffer={() => undefined}
        writeBuffer={() => {}}
        useSession={neverHook}
        useSessions={sel => sel(sessionList('/tmp/proj'))}
        useWorkspaces={neverHook}
        useProjection={neverHook}
        useInput={neverHook}
        inputActions={undefined}
        listDir={async () => ({ ok: false })}
        readFile={async () => ({ ok: false })}
        readFileMedia={async () => ({ ok: true })}
        mentionFile={() => {}}
        writeFile={async () => ({ ok: true })}
        t={t}
      />,
    )
    expect(await screen.findByText('Could not read the file.')).toBeTruthy()
    rerender(
      <FilePreview
        sessionId={SID}
        relativePath="a.ts"
        active
        onDirtyChange={() => {}}
        registerSave={() => {}}
        readBuffer={() => undefined}
        writeBuffer={() => {}}
        useSession={neverHook}
        useSessions={sel => sel(sessionList('/tmp/proj'))}
        useWorkspaces={neverHook}
        useProjection={neverHook}
        useInput={neverHook}
        inputActions={undefined}
        listDir={async () => ({ ok: false })}
        readFile={async () => ({ ok: true, binary: false })}
        readFileMedia={async () => ({ ok: false })}
        mentionFile={() => {}}
        writeFile={async () => ({ ok: true })}
        t={t}
      />,
    )
    await waitFor(() => {
      expect(screen.queryByText('Could not read the file.')).toBeNull()
    })
  })

  it('saves an edited text file and toggles markdown source', async () => {
    const writeFile = vi.fn(async () => ({ ok: true }))
    render(
      <FilePreview
        sessionId={SID}
        relativePath="note.md"
        active
        onDirtyChange={() => {}}
        registerSave={() => {}}
        readBuffer={() => undefined}
        writeBuffer={() => {}}
        useSession={neverHook}
        useSessions={sel => sel(sessionList('/tmp/proj'))}
        useWorkspaces={neverHook}
        useProjection={neverHook}
        useInput={neverHook}
        inputActions={undefined}
        listDir={async () => ({ ok: false })}
        readFile={async () => ({ ok: true, text: '# Hello', binary: false })}
        readFileMedia={async () => ({ ok: false })}
        mentionFile={() => {}}
        writeFile={writeFile}
        t={t}
      />,
    )
    fireEvent.click(await screen.findByRole('button', { name: 'Source' }))
    const editor = await screen.findByLabelText('note.md')
    fireEvent.change(editor, { target: { value: '# Saved' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => {
      expect(writeFile).toHaveBeenCalledWith('/tmp/proj', 'note.md', '# Saved')
    })
    fireEvent.click(screen.getByRole('button', { name: 'Rendered' }))
  })

  it('shows the write error when save fails', async () => {
    render(
      <FilePreview
        sessionId={SID}
        relativePath="a.ts"
        active
        onDirtyChange={() => {}}
        registerSave={() => {}}
        readBuffer={() => undefined}
        writeBuffer={() => {}}
        useSession={neverHook}
        useSessions={sel => sel(sessionList('/tmp/proj'))}
        useWorkspaces={neverHook}
        useProjection={neverHook}
        useInput={neverHook}
        inputActions={undefined}
        listDir={async () => ({ ok: false })}
        readFile={async () => ({ ok: true, text: 'x', binary: false })}
        readFileMedia={async () => ({ ok: false })}
        mentionFile={() => {}}
        writeFile={async () => ({ ok: false, message: 'disk full' })}
        t={t}
      />,
    )
    const editor = await screen.findByLabelText('a.ts')
    fireEvent.change(editor, { target: { value: 'y' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('disk full')).toBeTruthy()
    expect((screen.getByLabelText('a.ts') as HTMLTextAreaElement).value).toBe('y')
    expect(screen.getByRole('button', { name: 'Save' })).toBeTruthy()
  })

  it('keeps an unsaved draft when the parent stays mounted but hidden', async () => {
    const { rerender } = render(
      <div data-keep-alive hidden={false}>
        <FilePreview
          sessionId={SID}
          relativePath="a.ts"
          active
          onDirtyChange={() => {}}
        registerSave={() => {}}
        readBuffer={() => undefined}
        writeBuffer={() => {}}
          useSession={neverHook}
          useSessions={sel => sel(sessionList('/tmp/proj'))}
          useWorkspaces={neverHook}
          useProjection={neverHook}
          useInput={neverHook}
          inputActions={undefined}
          listDir={async () => ({ ok: false })}
          readFile={async () => ({ ok: true, text: 'x', binary: false })}
          readFileMedia={async () => ({ ok: false })}
          mentionFile={() => {}}
          writeFile={async () => ({ ok: true })}
          t={t}
        />
      </div>,
    )
    const editor = await screen.findByLabelText('a.ts')
    fireEvent.change(editor, { target: { value: 'unsaved keep-alive' } })
    rerender(
      <div data-keep-alive hidden>
        <FilePreview
          sessionId={SID}
          relativePath="a.ts"
          active
          onDirtyChange={() => {}}
        registerSave={() => {}}
        readBuffer={() => undefined}
        writeBuffer={() => {}}
          useSession={neverHook}
          useSessions={sel => sel(sessionList('/tmp/proj'))}
          useWorkspaces={neverHook}
          useProjection={neverHook}
          useInput={neverHook}
          inputActions={undefined}
          listDir={async () => ({ ok: false })}
          readFile={async () => ({ ok: true, text: 'x', binary: false })}
          readFileMedia={async () => ({ ok: false })}
          mentionFile={() => {}}
          writeFile={async () => ({ ok: true })}
          t={t}
        />
      </div>,
    )
    expect((document.querySelector('[data-keep-alive] textarea') as HTMLTextAreaElement).value).toBe('unsaved keep-alive')
    rerender(
      <div data-keep-alive hidden={false}>
        <FilePreview
          sessionId={SID}
          relativePath="a.ts"
          active
          onDirtyChange={() => {}}
        registerSave={() => {}}
        readBuffer={() => undefined}
        writeBuffer={() => {}}
          useSession={neverHook}
          useSessions={sel => sel(sessionList('/tmp/proj'))}
          useWorkspaces={neverHook}
          useProjection={neverHook}
          useInput={neverHook}
          inputActions={undefined}
          listDir={async () => ({ ok: false })}
          readFile={async () => ({ ok: true, text: 'x', binary: false })}
          readFileMedia={async () => ({ ok: false })}
          mentionFile={() => {}}
          writeFile={async () => ({ ok: true })}
          t={t}
        />
      </div>,
    )
    expect((screen.getByLabelText('a.ts') as HTMLTextAreaElement).value).toBe('unsaved keep-alive')
  })

  it('keeps the editor when writeFile throws', async () => {
    render(
      <FilePreview
        sessionId={SID}
        relativePath="a.ts"
        active
        onDirtyChange={() => {}}
        registerSave={() => {}}
        readBuffer={() => undefined}
        writeBuffer={() => {}}
        useSession={neverHook}
        useSessions={sel => sel(sessionList('/tmp/proj'))}
        useWorkspaces={neverHook}
        useProjection={neverHook}
        useInput={neverHook}
        inputActions={undefined}
        listDir={async () => ({ ok: false })}
        readFile={async () => ({ ok: true, text: 'x', binary: false })}
        readFileMedia={async () => ({ ok: false })}
        mentionFile={() => {}}
        writeFile={async () => { throw new Error('locked') }}
        t={t}
      />,
    )
    const editor = await screen.findByLabelText('a.ts')
    fireEvent.change(editor, { target: { value: 'kept' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('Could not save the file.')).toBeTruthy()
    expect((screen.getByLabelText('a.ts') as HTMLTextAreaElement).value).toBe('kept')
  })

  it('uses the write error copy when save fails without a message', async () => {
    render(
      <FilePreview
        sessionId={SID}
        relativePath="a.ts"
        active
        onDirtyChange={() => {}}
        registerSave={() => {}}
        readBuffer={() => undefined}
        writeBuffer={() => {}}
        useSession={neverHook}
        useSessions={sel => sel(sessionList('/tmp/proj'))}
        useWorkspaces={neverHook}
        useProjection={neverHook}
        useInput={neverHook}
        inputActions={undefined}
        listDir={async () => ({ ok: false })}
        readFile={async () => ({ ok: true, text: 'x', binary: false })}
        readFileMedia={async () => ({ ok: false })}
        mentionFile={() => {}}
        writeFile={async () => ({ ok: false })}
        t={t}
      />,
    )
    const editor = await screen.findByLabelText('a.ts')
    fireEvent.change(editor, { target: { value: 'z' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('Could not save the file.')).toBeTruthy()
    expect((screen.getByLabelText('a.ts') as HTMLTextAreaElement).value).toBe('z')
  })
  it('keeps dirty reporting when cwd becomes undefined', async () => {
    const onDirtyChange = vi.fn()
    const { rerender } = render(
      <FilePreview
        sessionId={SID}
        relativePath="a.ts"
        active
        onDirtyChange={onDirtyChange}
        registerSave={() => {}}
        readBuffer={() => undefined}
        writeBuffer={() => {}}
        useSession={neverHook}
        useSessions={sel => sel(sessionList('/tmp/proj'))}
        useWorkspaces={neverHook}
        useProjection={neverHook}
        useInput={neverHook}
        inputActions={undefined}
        listDir={async () => ({ ok: false })}
        readFile={async () => ({ ok: true, text: 'x', binary: false })}
        readFileMedia={async () => ({ ok: false })}
        mentionFile={() => {}}
        writeFile={async () => ({ ok: true })}
        t={t}
      />,
    )
    const editor = await screen.findByLabelText('a.ts')
    fireEvent.change(editor, { target: { value: 'dirty' } })
    await waitFor(() => { expect(onDirtyChange).toHaveBeenCalledWith(true) })
    onDirtyChange.mockClear()
    rerender(
      <FilePreview
        sessionId={SID}
        relativePath="a.ts"
        active
        onDirtyChange={onDirtyChange}
        registerSave={() => {}}
        readBuffer={() => undefined}
        writeBuffer={() => {}}
        useSession={neverHook}
        useSessions={sel => sel(sessionList(undefined))}
        useWorkspaces={neverHook}
        useProjection={neverHook}
        useInput={neverHook}
        inputActions={undefined}
        listDir={async () => ({ ok: false })}
        readFile={async () => ({ ok: true, text: 'x', binary: false })}
        readFileMedia={async () => ({ ok: false })}
        mentionFile={() => {}}
        writeFile={async () => ({ ok: true })}
        t={t}
      />,
    )
    expect(await screen.findByText('A workspace is required to browse files.')).toBeTruthy()
    // Dirty must not flip to false when cwd disappears (confirm still protects the buffer).
    expect(onDirtyChange).not.toHaveBeenCalledWith(false)
    expect((screen.getByLabelText('a.ts') as HTMLTextAreaElement).value).toBe('dirty')
  })

  it('keeps a dirty draft when disk content changes under the buffer', async () => {
    let disk = 'v1'
    const buffer = { text: 'v1', draft: 'edited' }
    render(
      <FilePreview
        sessionId={SID}
        relativePath="a.ts"
        active
        onDirtyChange={() => {}}
        registerSave={() => {}}
        readBuffer={() => buffer}
        writeBuffer={(next) => {
          if (next === null) {
            buffer.text = ''
            buffer.draft = ''
            return
          }
          buffer.text = next.text
          buffer.draft = next.draft
        }}
        useSession={neverHook}
        useSessions={sel => sel(sessionList('/tmp/proj'))}
        useWorkspaces={neverHook}
        useProjection={neverHook}
        useInput={neverHook}
        inputActions={undefined}
        listDir={async () => ({ ok: false })}
        readFile={async () => ({ ok: true, text: disk, binary: false })}
        readFileMedia={async () => ({ ok: false })}
        mentionFile={() => {}}
        writeFile={async () => ({ ok: true })}
        t={t}
      />,
    )
    expect(await screen.findByLabelText('a.ts')).toBeTruthy()
    expect((screen.getByLabelText('a.ts') as HTMLTextAreaElement).value).toBe('edited')
    disk = 'v2'
    cleanup()
    render(
      <FilePreview
        sessionId={SID}
        relativePath="a.ts"
        active
        onDirtyChange={() => {}}
        registerSave={() => {}}
        readBuffer={() => buffer}
        writeBuffer={(next) => {
          if (next === null) {
            buffer.text = ''
            buffer.draft = ''
            return
          }
          buffer.text = next.text
          buffer.draft = next.draft
        }}
        useSession={neverHook}
        useSessions={sel => sel(sessionList('/tmp/proj'))}
        useWorkspaces={neverHook}
        useProjection={neverHook}
        useInput={neverHook}
        inputActions={undefined}
        listDir={async () => ({ ok: false })}
        readFile={async () => ({ ok: true, text: disk, binary: false })}
        readFileMedia={async () => ({ ok: false })}
        mentionFile={() => {}}
        writeFile={async () => ({ ok: true })}
        t={t}
      />,
    )
    expect(await screen.findByLabelText('a.ts')).toBeTruthy()
    expect((screen.getByLabelText('a.ts') as HTMLTextAreaElement).value).toBe('edited')
    expect(buffer.text).toBe('v2')
    expect(buffer.draft).toBe('edited')
  })

  it('saves with Ctrl+S when the editor is dirty', async () => {
    const writeFile = vi.fn(async () => ({ ok: true as const }))
    render(
      <FilePreview
        sessionId={SID}
        relativePath="a.ts"
        active
        onDirtyChange={() => {}}
        registerSave={() => {}}
        readBuffer={() => undefined}
        writeBuffer={() => {}}
        useSession={neverHook}
        useSessions={sel => sel(sessionList('/tmp/proj'))}
        useWorkspaces={neverHook}
        useProjection={neverHook}
        useInput={neverHook}
        inputActions={undefined}
        listDir={async () => ({ ok: false })}
        readFile={async () => ({ ok: true, text: 'x', binary: false })}
        readFileMedia={async () => ({ ok: false })}
        mentionFile={() => {}}
        writeFile={writeFile}
        t={t}
      />,
    )
    const editor = await screen.findByLabelText('a.ts')
    fireEvent.change(editor, { target: { value: 'saved-by-key' } })
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true }))
    })
    await waitFor(() => {
      expect(writeFile).toHaveBeenCalledWith('/tmp/proj', 'a.ts', 'saved-by-key')
    })
  })
  it('keeps a dirty buffer when readFile fails after remount', async () => {
    const buffer = { text: 'v1', draft: 'edited' }
    render(
      <FilePreview
        sessionId={SID}
        relativePath="a.ts"
        active
        onDirtyChange={() => {}}
        registerSave={() => {}}
        readBuffer={() => buffer}
        writeBuffer={(next) => {
          if (next === null) {
            buffer.text = ''
            buffer.draft = ''
            return
          }
          buffer.text = next.text
          buffer.draft = next.draft
        }}
        useSession={neverHook}
        useSessions={sel => sel(sessionList('/tmp/proj'))}
        useWorkspaces={neverHook}
        useProjection={neverHook}
        useInput={neverHook}
        inputActions={undefined}
        listDir={async () => ({ ok: false })}
        readFile={async () => ({ ok: false, message: 'gone' })}
        readFileMedia={async () => ({ ok: false })}
        mentionFile={() => {}}
        writeFile={async () => ({ ok: true })}
        t={t}
      />,
    )
    expect(await screen.findByText('gone')).toBeTruthy()
    expect(buffer.draft).toBe('edited')
    expect(buffer.text).toBe('v1')
    expect((screen.getByLabelText('a.ts') as HTMLTextAreaElement).value).toBe('edited')
  })

  it('saves a dirty draft after the last read failed', async () => {
    let save: (() => Promise<boolean>) | null = null
    const writeFile = vi.fn(async () => ({ ok: true as const }))
    render(
      <FilePreview
        sessionId={SID}
        relativePath="a.ts"
        active
        onDirtyChange={() => {}}
        registerSave={(next) => { save = next }}
        readBuffer={() => ({ text: 'v1', draft: 'edited' })}
        writeBuffer={() => {}}
        useSession={neverHook}
        useSessions={sel => sel(sessionList('/tmp/proj'))}
        useWorkspaces={neverHook}
        useProjection={neverHook}
        useInput={neverHook}
        inputActions={undefined}
        listDir={async () => ({ ok: false })}
        readFile={async () => ({ ok: false, message: 'gone' })}
        readFileMedia={async () => ({ ok: false })}
        mentionFile={() => {}}
        writeFile={writeFile}
        t={t}
      />,
    )
    expect(await screen.findByText('gone')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Save' })).toBeTruthy()
    expect((screen.getByLabelText('a.ts') as HTMLTextAreaElement).value).toBe('edited')
    await act(async () => {
      expect(await save?.()).toBe(true)
    })
    expect(writeFile).toHaveBeenCalledWith('/tmp/proj', 'a.ts', 'edited')
    expect(screen.queryByText('gone')).toBeNull()
  })

  it('lets a dirty markdown draft switch to source after the last read failed', async () => {
    render(
      <FilePreview
        sessionId={SID}
        relativePath="note.md"
        active
        onDirtyChange={() => {}}
        registerSave={() => {}}
        readBuffer={() => ({ text: '# v1', draft: '# edited' })}
        writeBuffer={() => {}}
        useSession={neverHook}
        useSessions={sel => sel(sessionList('/tmp/proj'))}
        useWorkspaces={neverHook}
        useProjection={neverHook}
        useInput={neverHook}
        inputActions={undefined}
        listDir={async () => ({ ok: false })}
        readFile={async () => ({ ok: false, message: 'gone' })}
        readFileMedia={async () => ({ ok: false })}
        mentionFile={() => {}}
        writeFile={async () => ({ ok: true })}
        t={t}
      />,
    )
    expect(await screen.findByText('gone')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Source' }))
    expect((await screen.findByLabelText('note.md') as HTMLTextAreaElement).value).toBe('# edited')
  })

  it('keeps a dirty draft editable and saveable after a truncated reread', async () => {
    const writeFile = vi.fn(async () => ({ ok: true as const }))
    render(
      <FilePreview
        sessionId={SID}
        relativePath="a.ts"
        active
        onDirtyChange={() => {}}
        registerSave={() => {}}
        readBuffer={() => ({ text: 'v1', draft: 'edited' })}
        writeBuffer={() => {}}
        useSession={neverHook}
        useSessions={sel => sel(sessionList('/tmp/proj'))}
        useWorkspaces={neverHook}
        useProjection={neverHook}
        useInput={neverHook}
        inputActions={undefined}
        listDir={async () => ({ ok: false })}
        readFile={async () => ({ ok: true, text: 'v1-prefix', binary: false, truncated: true })}
        readFileMedia={async () => ({ ok: false })}
        mentionFile={() => {}}
        writeFile={writeFile}
        t={t}
      />,
    )
    expect(await screen.findByText('File is too large; showing the beginning.')).toBeTruthy()
    expect((screen.getByLabelText('a.ts') as HTMLTextAreaElement).value).toBe('edited')
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => {
      expect(writeFile).toHaveBeenCalledWith('/tmp/proj', 'a.ts', 'edited')
    })
    expect(screen.queryByText('File is too large; showing the beginning.')).toBeNull()
  })

  it('lets a dirty markdown draft switch to source after a truncated reread', async () => {
    render(
      <FilePreview
        sessionId={SID}
        relativePath="note.md"
        active
        onDirtyChange={() => {}}
        registerSave={() => {}}
        readBuffer={() => ({ text: '# v1', draft: '# edited' })}
        writeBuffer={() => {}}
        useSession={neverHook}
        useSessions={sel => sel(sessionList('/tmp/proj'))}
        useWorkspaces={neverHook}
        useProjection={neverHook}
        useInput={neverHook}
        inputActions={undefined}
        listDir={async () => ({ ok: false })}
        readFile={async () => ({ ok: true, text: '# v1-prefix', binary: false, truncated: true })}
        readFileMedia={async () => ({ ok: false })}
        mentionFile={() => {}}
        writeFile={async () => ({ ok: true })}
        t={t}
      />,
    )
    expect(await screen.findByText('File is too large; showing the beginning.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Source' }))
    expect((await screen.findByLabelText('note.md') as HTMLTextAreaElement).value).toBe('# edited')
  })

  it('keeps a dirty draft editable and saveable after a binary reread', async () => {
    const writeFile = vi.fn(async () => ({ ok: true as const }))
    render(
      <FilePreview
        sessionId={SID}
        relativePath="a.ts"
        active
        onDirtyChange={() => {}}
        registerSave={() => {}}
        readBuffer={() => ({ text: 'v1', draft: 'edited' })}
        writeBuffer={() => {}}
        useSession={neverHook}
        useSessions={sel => sel(sessionList('/tmp/proj'))}
        useWorkspaces={neverHook}
        useProjection={neverHook}
        useInput={neverHook}
        inputActions={undefined}
        listDir={async () => ({ ok: false })}
        readFile={async () => ({ ok: true, binary: true, text: '' })}
        readFileMedia={async () => ({ ok: false })}
        mentionFile={() => {}}
        writeFile={writeFile}
        t={t}
      />,
    )
    expect(await screen.findByText('This binary file cannot be previewed.')).toBeTruthy()
    expect((screen.getByLabelText('a.ts') as HTMLTextAreaElement).value).toBe('edited')
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => {
      expect(writeFile).toHaveBeenCalledWith('/tmp/proj', 'a.ts', 'edited')
    })
    expect(screen.queryByText('This binary file cannot be previewed.')).toBeNull()
  })

  it('lets a dirty markdown draft switch to source when cwd is missing', async () => {
    render(
      <FilePreview
        sessionId={SID}
        relativePath="note.md"
        active
        onDirtyChange={() => {}}
        registerSave={() => {}}
        readBuffer={() => ({ text: '# v1', draft: '# edited' })}
        writeBuffer={() => {}}
        useSession={neverHook}
        useSessions={sel => sel(sessionList(undefined))}
        useWorkspaces={neverHook}
        useProjection={neverHook}
        useInput={neverHook}
        inputActions={undefined}
        listDir={async () => ({ ok: false })}
        readFile={async () => ({ ok: true, text: '# v1', binary: false })}
        readFileMedia={async () => ({ ok: false })}
        mentionFile={() => {}}
        writeFile={async () => ({ ok: true })}
        t={t}
      />,
    )
    expect(await screen.findByText('A workspace is required to browse files.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Source' }))
    expect((await screen.findByLabelText('note.md') as HTMLTextAreaElement).value).toBe('# edited')
    expect((screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('does not mount the editor until the first read settles', async () => {
    let resolveRead: ((value: { ok: true; text: string; binary: false }) => void) | undefined
    render(
      <FilePreview
        sessionId={SID}
        relativePath="a.ts"
        active
        onDirtyChange={() => {}}
        registerSave={() => {}}
        readBuffer={() => undefined}
        writeBuffer={() => {}}
        useSession={neverHook}
        useSessions={sel => sel(sessionList('/tmp/proj'))}
        useWorkspaces={neverHook}
        useProjection={neverHook}
        useInput={neverHook}
        inputActions={undefined}
        listDir={async () => ({ ok: false })}
        readFile={() => new Promise(resolve => { resolveRead = resolve })}
        readFileMedia={async () => ({ ok: false })}
        mentionFile={() => {}}
        writeFile={async () => ({ ok: true })}
        t={t}
      />,
    )
    expect(screen.queryByLabelText('a.ts')).toBeNull()
    await act(async () => {
      resolveRead?.({ ok: true, text: 'from-disk', binary: false })
    })
    expect(await screen.findByLabelText('a.ts')).toBeTruthy()
    expect((screen.getByLabelText('a.ts') as HTMLTextAreaElement).value).toBe('from-disk')
  })

  it('refuses save once when disk diverged, then overwrites on the second save', async () => {
    let disk = 'v1'
    const writeFile = vi.fn(async (_cwd: string, _path: string, text: string) => {
      disk = text
      return { ok: true as const }
    })
    render(
      <FilePreview
        sessionId={SID}
        relativePath="a.ts"
        active
        onDirtyChange={() => {}}
        registerSave={() => {}}
        readBuffer={() => undefined}
        writeBuffer={() => {}}
        useSession={neverHook}
        useSessions={sel => sel(sessionList('/tmp/proj'))}
        useWorkspaces={neverHook}
        useProjection={neverHook}
        useInput={neverHook}
        inputActions={undefined}
        listDir={async () => ({ ok: false })}
        readFile={async () => ({ ok: true, text: disk, binary: false })}
        readFileMedia={async () => ({ ok: false })}
        mentionFile={() => {}}
        writeFile={writeFile}
        t={t}
      />,
    )
    const editor = await screen.findByLabelText('a.ts')
    fireEvent.change(editor, { target: { value: 'mine' } })
    disk = 'theirs'
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('The file changed on disk. Save again to overwrite.')).toBeTruthy()
    expect(writeFile).not.toHaveBeenCalled()
    expect((screen.getByLabelText('a.ts') as HTMLTextAreaElement).value).toBe('mine')
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => {
      expect(writeFile).toHaveBeenCalledWith('/tmp/proj', 'a.ts', 'mine')
    })
  })

  it('does not reread while inactive and rereads on activate without dropping the draft', async () => {
    let disk = 'v1'
    const reads: string[] = []
    const buffer = { text: 'v1', draft: 'edited' }
    const preview = (active: boolean) => (
      <FilePreview
        sessionId={SID}
        relativePath="a.ts"
        active={active}
        onDirtyChange={() => {}}
        registerSave={() => {}}
        readBuffer={() => buffer}
        writeBuffer={(next) => {
          if (next === null) {
            buffer.text = ''
            buffer.draft = ''
            return
          }
          buffer.text = next.text
          buffer.draft = next.draft
        }}
        useSession={neverHook}
        useSessions={sel => sel(sessionList('/tmp/proj'))}
        useWorkspaces={neverHook}
        useProjection={neverHook}
        useInput={neverHook}
        inputActions={undefined}
        listDir={async () => ({ ok: false })}
        readFile={async () => {
          reads.push(disk)
          return { ok: true, text: disk, binary: false }
        }}
        readFileMedia={async () => ({ ok: false })}
        mentionFile={() => {}}
        writeFile={async () => ({ ok: true })}
        t={t}
      />
    )
    const { rerender } = render(preview(false))
    expect(await screen.findByLabelText('a.ts')).toBeTruthy()
    expect((screen.getByLabelText('a.ts') as HTMLTextAreaElement).value).toBe('edited')
    expect(reads).toEqual([])
    disk = 'v2'
    rerender(preview(false))
    expect(reads).toEqual([])
    rerender(preview(true))
    await waitFor(() => { expect(reads).toEqual(['v2']) })
    expect((screen.getByLabelText('a.ts') as HTMLTextAreaElement).value).toBe('edited')
    expect(buffer.text).toBe('v2')
    expect(buffer.draft).toBe('edited')
  })

  it('does not save with Ctrl+S while the tab is inactive', async () => {
    const writeFile = vi.fn(async () => ({ ok: true as const }))
    render(
      <FilePreview
        sessionId={SID}
        relativePath="a.ts"
        active={false}
        onDirtyChange={() => {}}
        registerSave={() => {}}
        readBuffer={() => ({ text: 'x', draft: 'edited' })}
        writeBuffer={() => {}}
        useSession={neverHook}
        useSessions={sel => sel(sessionList('/tmp/proj'))}
        useWorkspaces={neverHook}
        useProjection={neverHook}
        useInput={neverHook}
        inputActions={undefined}
        listDir={async () => ({ ok: false })}
        readFile={async () => ({ ok: true, text: 'x', binary: false })}
        readFileMedia={async () => ({ ok: false })}
        mentionFile={() => {}}
        writeFile={writeFile}
        t={t}
      />,
    )
    expect(await screen.findByLabelText('a.ts')).toBeTruthy()
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true }))
    })
    expect(writeFile).not.toHaveBeenCalled()
  })
})
