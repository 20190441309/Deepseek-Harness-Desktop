import { useEffect, useState, type KeyboardEvent, type ReactNode } from 'react'
import { IconRefreshOutline16, Input, Tooltip, writeClipboard } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { serializeComposerFileLink } from './composerMention.ts'
import { filterEntries } from './filter.ts'
import { FileTree, joinRel, type TreeEntry } from './FileTree.tsx'
import { NS } from './locales.ts'
import { getProjectFilePickerMatches, type ProjectEntry } from './projectFilePicker.ts'
import type { FilesShellInjected } from './shell.ts'
import css from './FilesPanel.module.css'

export type FilesPanelProps =
  & PropsRuntime<'surfaces.files'>
  & PropsLocale<typeof NS>
  & InjectFace<FilesShellInjected>

function currentCwd(useSessions: FilesPanelProps['useSessions']): string | undefined {
  return useSessions((s) => {
    const id = s.current
    const next = id === undefined ? undefined : s.byId[id]?.cwd
    return next ? next : undefined
  })
}

function toTree(parent: string, entries: { name: string; kind: 'file' | 'directory' }[]): TreeEntry[] {
  return entries.map(entry => ({ ...entry, path: joinRel(parent, entry.name) }))
}

function absoluteOf(cwd: string, relativePath: string): string {
  const root = cwd.replaceAll('\\', '/').replace(/\/+$/, '')
  /* v8 ignore next -- the tree copies entry paths, never the empty workspace root. */
  if (relativePath === '') return root
  return `${root}/${relativePath}`
}

function collectFiles(
  root: readonly TreeEntry[],
  childrenByPath: Record<string, TreeEntry[]>,
): ProjectEntry[] {
  const files: ProjectEntry[] = []
  const visit = (entries: readonly TreeEntry[]): void => {
    for (const entry of entries) {
      if (entry.kind === 'file') files.push({ kind: 'file', path: entry.path })
      else visit(childrenByPath[entry.path] ?? [])
    }
  }
  visit(root)
  return files
}

/**
 * Workspace file tree occupant of `surfaces.files`. Clicking a file opens a
 * `file:` surface through the owner `openFile` callback. Refresh reloads the
 * root listing; while a search query is active it re-walks that search instead
 * of dropping nested matches. Mention is omitted without a session id. A nested
 * `listDir` failure keeps the tree and shows a banner; only the workspace-root
 * listing replaces the tree.
 * @param props - session-maybe seats, listing IPC, locale, and openFile.
 * @returns the files panel.
 */
export function FilesPanel({
  sessionId,
  useSessions,
  openFile,
  listDir,
  mentionFile,
  listEditors,
  openInEditor,
  showItemInFolder,
  openWithSystemDefault,
  t,
}: FilesPanelProps): ReactNode {
  const cwd = currentCwd(useSessions)
  const [root, setRoot] = useState<TreeEntry[]>([])
  const [childrenByPath, setChildrenByPath] = useState<Record<string, TreeEntry[]>>({})
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [generation, setGeneration] = useState(0)
  const [query, setQuery] = useState('')
  const [editors, setEditors] = useState<readonly { id: string, label: string }[]>([])

  useEffect(() => {
    if (cwd === undefined) {
      setRoot([])
      setChildrenByPath({})
      setError(null)
      return
    }
    let cancelled = false
    void listDir(cwd, '').then((result) => {
      if (cancelled) return
      if (!result.ok) {
        setError(result.message ?? t('error.list'))
        setRoot([])
        return
      }
      setError(null)
      setRoot(toTree('', result.entries ?? []))
    }).catch(() => {
      if (!cancelled) {
        setError(t('error.list'))
      }
    })
    return () => { cancelled = true }
  }, [cwd, listDir, t, generation])

  useEffect(() => {
    if (cwd === undefined || query.trim() === '') return
    let cancelled = false
    const walk = async (
      parent: string,
      acc: Record<string, TreeEntry[]>,
    ): Promise<void> => {
      const result = await listDir(cwd, parent)
      if (cancelled) return
      if (!result.ok) {
        if (parent === '') setError(result.message ?? t('error.list'))
        return
      }
      const entries = toTree(parent, result.entries ?? [])
      acc[parent] = entries
      for (const entry of entries) {
        if (entry.kind === 'directory') {
          await walk(entry.path, acc)
        }
      }
    }
    const acc: Record<string, TreeEntry[]> = {}
    void walk('', acc).then(() => {
      if (cancelled) return
      setRoot(acc[''] ?? [])
      setChildrenByPath(acc)
      setExpanded(new Set(Object.keys(acc).filter(path => path !== '')))
    })
    return () => { cancelled = true }
  }, [cwd, listDir, query, generation])

  useEffect(() => {
    if (listEditors === undefined) return
    let cancelled = false
    void listEditors().then((listed) => {
      if (!cancelled) setEditors(listed)
    })
    return () => { cancelled = true }
  }, [listEditors])

  const onToggle = (path: string): void => {
    if (expanded.has(path)) {
      const next = new Set(expanded)
      next.delete(path)
      setExpanded(next)
      return
    }
    setExpanded(new Set(expanded).add(path))
    if (childrenByPath[path] !== undefined) return
    /* v8 ignore next -- the tree unmounts when cwd is missing. */
    if (cwd === undefined) return
    void listDir(cwd, path).then((result) => {
      if (!result.ok) {
        setError(result.message ?? t('error.list'))
        return
      }
      setChildrenByPath(current => ({ ...current, [path]: toTree(path, result.entries ?? []) }))
    }).catch(() => { setError(t('error.list')) })
  }

  const copyPath = (value: string): void => {
    void writeClipboard(value).then((ok) => {
      if (!ok) return
      setCopied(true)
      window.setTimeout(() => { setCopied(false) }, 1200)
    })
  }

  const onSearchKey = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key !== 'Escape') return
    event.preventDefault()
    setQuery('')
  }

  const searching = query.trim() !== ''
  const visibleRoot = filterEntries(root, query, childrenByPath)
  const pickerMatches = searching
    ? getProjectFilePickerMatches(collectFiles(root, childrenByPath), query)
    : []

  return (
    <div className={css.root} data-files-panel>
      <div className={css.toolbar}>
        <Input
          className={css.search}
          value={query}
          placeholder={t('search')}
          aria-label={t('search')}
          onChange={event => { setQuery(event.target.value) }}
          onKeyDown={onSearchKey}
        />
        <Tooltip label={copied ? t('copied') : t('refresh')} side="bottom">
          <button
            type="button"
            className={css.refresh}
            aria-label={t('refresh')}
            onClick={() => {
              if (query.trim() === '') {
                setChildrenByPath({})
                setExpanded(new Set())
              }
              setGeneration(n => n + 1)
            }}
          >
            <IconRefreshOutline16 size={14} />
          </button>
        </Tooltip>
      </div>
      <div className={css.body}>
        {cwd === undefined ? (
          <p className={css.message}>{t('empty.cwd')}</p>
        ) : error !== null ? (
          <p className={css.message}>{error}</p>
        ) : root.length === 0 ? (
          <p className={css.message}>{t('empty.dir')}</p>
        ) : (
          searching ? (
            <div className={css.picker}>
              {pickerMatches.map(match => (
                <button
                  key={match.path}
                  type="button"
                  className={css.pickerRow}
                  onClick={() => { openFile(match.path) }}
                >
                  <span className={css.pickerName}>{match.name}</span>
                  <span className={css.pickerPath}>{match.path}</span>
                </button>
              ))}
            </div>
          ) : (
            <FileTree
              entries={visibleRoot}
              childrenByPath={childrenByPath}
              expanded={expanded}
              query={query}
              onToggle={onToggle}
              onOpenFile={openFile}
              onMention={sessionId === undefined ? undefined : (path) => {
                mentionFile(sessionId, path)
              }}
              onCopyRelative={(path) => { copyPath(path) }}
              onCopyAbsolute={(path) => { copyPath(absoluteOf(cwd, path)) }}
              onCopyMention={(path) => { copyPath(serializeComposerFileLink(path)) }}
              mentionLabel={sessionId === undefined ? undefined : t('mention')}
              copyMentionLabel={t('copy.mention')}
              copyRelativeLabel={t('copy.relative')}
              copyAbsoluteLabel={t('copy.absolute')}
              onShowInFolder={showItemInFolder === undefined ? undefined : (path) => {
                void showItemInFolder(cwd, path)
              }}
              onOpenInEditor={openInEditor === undefined ? undefined : (editor, path) => {
                void openInEditor({ editor, cwd, relativePath: path })
              }}
              onOpenWithSystemDefault={openWithSystemDefault === undefined ? undefined : (path) => {
                void openWithSystemDefault(cwd, path)
              }}
              editors={editors}
              showInFolderLabel={t('open.folder')}
              openWithSystemDefaultLabel={t('open.system')}
            />
          )
        )}
      </div>
    </div>
  )
}
