import { useEffect, useState, type ReactNode } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { FileTree, joinRel, type TreeEntry } from './FileTree.tsx'
import { NS } from './locales.ts'
import type { FilesShellInjected } from './shell.ts'
import css from './FilesPanel.module.css'

export type FilesPanelProps =
  & PropsRuntime<'surfaces.files'>
  & PropsLocale<typeof NS>
  & InjectFace<FilesShellInjected>

function currentCwd(useSessions: FilesPanelProps['useSessions']): string | undefined {
  return useSessions(s => {
    const id = s.current
    const next = id === undefined ? undefined : s.byId[id]?.cwd
    return next ? next : undefined
  })
}

function toTree(parent: string, entries: { name: string; kind: 'file' | 'directory' }[]): TreeEntry[] {
  return entries.map(entry => ({ ...entry, path: joinRel(parent, entry.name) }))
}

/**
 * Workspace file tree occupant of `surfaces.files`. Clicking a file opens a
 * `file:` surface through the owner `openFile` callback.
 * @param props - session-maybe seats, listing IPC, locale, and openFile.
 * @returns the files panel.
 */
export function FilesPanel({
  useSessions,
  openFile,
  listDir,
  t,
}: FilesPanelProps): ReactNode {
  const cwd = currentCwd(useSessions)
  const [root, setRoot] = useState<TreeEntry[]>([])
  const [childrenByPath, setChildrenByPath] = useState<Record<string, TreeEntry[]>>({})
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set())
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (cwd === undefined) {
      setRoot([])
      setChildrenByPath({})
      setError(null)
      return
    }
    let cancelled = false
    void listDir(cwd, '').then(result => {
      if (cancelled) return
      if (!result.ok) {
        setError(result.message ?? t('error.list'))
        setRoot([])
        return
      }
      setError(null)
      setRoot(toTree('', result.entries ?? []))
    })
    return () => { cancelled = true }
  }, [cwd, listDir, t])

  const onToggle = (path: string): void => {
    if (expanded.has(path)) {
      const next = new Set(expanded)
      next.delete(path)
      setExpanded(next)
      return
    }
    setExpanded(new Set(expanded).add(path))
    if (cwd === undefined || childrenByPath[path] !== undefined) return
    void listDir(cwd, path).then(result => {
      if (!result.ok) {
        setError(result.message ?? t('error.list'))
        return
      }
      setChildrenByPath(current => ({ ...current, [path]: toTree(path, result.entries ?? []) }))
    })
  }

  return (
    <div className={css.root} data-files-panel>
      <div className={css.header} data-surface-subheader>
        <h3 className={css.title}>{t('title')}</h3>
      </div>
      <div className={css.body}>
        {cwd === undefined ? (
          <p className={css.message}>{t('empty.cwd')}</p>
        ) : error !== null ? (
          <p className={css.message}>{error}</p>
        ) : root.length === 0 ? (
          <p className={css.message}>{t('empty.dir')}</p>
        ) : (
          <FileTree
            entries={root}
            childrenByPath={childrenByPath}
            expanded={expanded}
            onToggle={onToggle}
            onOpenFile={openFile}
          />
        )}
      </div>
    </div>
  )
}
