// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, act } from '@testing-library/react'
import { writeClipboard } from '@deepseek-ai/dsh-client-ui-primitives'

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@deepseek-ai/dsh-client-ui-primitives')>()
  return { ...actual, writeClipboard: vi.fn(async () => true) }
})
import type { SessionId, SessionListState } from '@deepseek-ai/dsh-client-runtime/client'
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
        t={t}
      />,
    )
    await waitFor(() => {
      expect(screen.getByText('README.md')).toBeTruthy()
    })
    fireEvent.click(screen.getByRole('button', { name: 'Mention in composer' }))
    expect(mentionFile).toHaveBeenCalledWith(SID, 'README.md')
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
        t={t}
      />,
    )
    await waitFor(() => {
      expect(screen.getByText('README.md')).toBeTruthy()
    })
    fireEvent.click(screen.getByRole('button', { name: 'Mention in composer' }))
    expect(mentionFile).not.toHaveBeenCalled()
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
        readFileMedia={async () => ({ ok: false })}
        mentionFile={() => {}}
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
        t={t}
      />,
    )
    expect(await screen.findByText('Hello')).toBeTruthy()
    rerender(
      <FilePreview
        sessionId={SID}
        relativePath="icon.png"
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
        t={t}
      />,
    )
    expect(await screen.findByText('File is too large; showing the beginning.')).toBeTruthy()
    expect(screen.getByText('const x = 1')).toBeTruthy()
    rerender(
      <FilePreview
        sessionId={SID}
        relativePath="blob.bin"
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
        t={t}
      />,
    )
    expect(await screen.findByText('This binary file cannot be previewed.')).toBeTruthy()
    rerender(
      <FilePreview
        sessionId={SID}
        relativePath="icon.png"
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
        t={t}
      />,
    )
    unmount()
    finish({ ok: true, text: 'late', binary: false })
    const { rerender } = render(
      <FilePreview
        sessionId={SID}
        relativePath="icon.png"
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
        t={t}
      />,
    )
    expect(await screen.findByText('Could not read the file.')).toBeTruthy()
    rerender(
      <FilePreview
        sessionId={SID}
        relativePath="photo.jpg"
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
        t={t}
      />,
    )
    expect(await screen.findByText('File is too large; showing the beginning.')).toBeTruthy()
    rerender(
      <FilePreview
        sessionId={SID}
        relativePath="note.md"
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
        t={t}
      />,
    )
    expect(await screen.findByText('File is too large; showing the beginning.')).toBeTruthy()
    rerender(
      <FilePreview
        sessionId={SID}
        relativePath="missing.ts"
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
        t={t}
      />,
    )
    expect(await screen.findByText('mit')).toBeTruthy()
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
        t={t}
      />,
    )
    unmountText()
    failText(new Error('late-text'))
    const { rerender } = render(
      <FilePreview
        sessionId={SID}
        relativePath="icon.png"
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
        t={t}
      />,
    )
    expect(await screen.findByText('Could not read the file.')).toBeTruthy()
    rerender(
      <FilePreview
        sessionId={SID}
        relativePath="a.ts"
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
        t={t}
      />,
    )
    await waitFor(() => {
      expect(screen.queryByText('Could not read the file.')).toBeNull()
    })
  })
})
