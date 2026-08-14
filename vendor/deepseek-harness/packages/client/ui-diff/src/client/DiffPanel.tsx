import { useEffect, useState, type ReactNode } from 'react'
import clsx from 'clsx'
import { DisclosureRow, IconCodeOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { NS } from './locales.ts'
import type { DiffFile, DiffShellInjected } from './shell.ts'
import css from './DiffPanel.module.css'

export type DiffPanelProps =
  & PropsRuntime<'surfaces.diff'>
  & PropsLocale<typeof NS>
  & InjectFace<DiffShellInjected>

function currentCwd(useSessions: DiffPanelProps['useSessions']): string | undefined {
  return useSessions(s => {
    const id = s.current
    const next = id === undefined ? undefined : s.byId[id]?.cwd
    return next ? next : undefined
  })
}

function marker(kind: 'context' | 'add' | 'del'): string {
  if (kind === 'add') return '+'
  if (kind === 'del') return '-'
  return ' '
}

/**
 * Workspace diff occupant of `surfaces.diff`. Not a git repository shows the
 * T3code Diff disabled reason.
 * @param props - session-maybe seats, git IPC, and copy.
 * @returns the diff panel.
 */
export function DiffPanel({
  useSessions,
  gitStatus,
  gitDiff,
  t,
}: DiffPanelProps): ReactNode {
  const cwd = currentCwd(useSessions)
  const [available, setAvailable] = useState(false)
  const [files, setFiles] = useState<DiffFile[]>([])
  const [error, setError] = useState<string | null>(null)
  const [openPaths, setOpenPaths] = useState<ReadonlySet<string>>(new Set())

  useEffect(() => {
    if (cwd === undefined) {
      setAvailable(false)
      setFiles([])
      setError(null)
      return
    }
    let cancelled = false
    void Promise.all([gitStatus(cwd), gitDiff(cwd)]).then(([status, diff]) => {
      if (cancelled) return
      if (status === null || diff === null) {
        setAvailable(false)
        setFiles([])
        setError(null)
        return
      }
      setAvailable(true)
      setFiles(diff.files)
      setOpenPaths(new Set(diff.files.map(file => file.path)))
      setError(null)
    }).catch(() => {
      if (!cancelled) setError(t('error.load'))
    })
    return () => { cancelled = true }
  }, [cwd, gitStatus, gitDiff, t])

  const toggle = (path: string): void => {
    const next = new Set(openPaths)
    if (next.has(path)) next.delete(path)
    else next.add(path)
    setOpenPaths(next)
  }

  return (
    <div className={css.root} data-diff-panel>
      <div className={css.header} data-surface-subheader>
        <h3 className={css.title}>{t('title')}</h3>
      </div>
      <div className={css.body}>
        {cwd === undefined ? (
          <p className={css.message}>{t('empty.cwd')}</p>
        ) : error !== null ? (
          <p className={css.message}>{error}</p>
        ) : !available ? (
          <p className={css.message} data-diff-unavailable>{t('unavailable')}</p>
        ) : files.length === 0 ? (
          <p className={css.message}>{t('empty.changes')}</p>
        ) : (
          files.map(file => (
            <DisclosureRow
              key={file.path}
              icon={<IconCodeOutline16 size={14} />}
              title={file.path}
              open={openPaths.has(file.path)}
              expandable
              expandOnRowClick
              onToggle={() => { toggle(file.path) }}
            >
              <div className={css.hunks}>
                {file.hunks.map((hunk, index) => (
                  <div key={`${file.path}:${index}`} className={css.hunk}>
                    <div className={css.hunkHeader}>{hunk.header}</div>
                    {hunk.lines.map((line, lineIndex) => (
                      <div
                        key={lineIndex}
                        className={clsx(css.line, css[line.kind])}
                      >
                        <span className={css.gutter}>{marker(line.kind)}</span>
                        <span>{line.text}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </DisclosureRow>
          ))
        )}
      </div>
    </div>
  )
}
