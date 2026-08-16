import { useCallback, useEffect, useState, type MouseEvent, type ReactNode } from 'react'
import clsx from 'clsx'
import {
  Button, DisclosureRow, IconCodeOutline16, IconRefreshOutline16, Modal, Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { NS } from './locales.ts'
import {
  isStaged, isUnstaged, type DiffFile, type DiffShellInjected, type GitStatusEntry,
} from './shell.ts'
import css from './DiffPanel.module.css'

export type DiffPanelProps =
  & PropsRuntime<'surfaces.diff'>
  & PropsLocale<typeof NS>
  & InjectFace<DiffShellInjected>

function currentCwd(useSessions: DiffPanelProps['useSessions']): string | undefined {
  return useSessions((s) => {
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
 * @param props - session-maybe seats, git IPC, openFile, and copy.
 * @returns the diff panel.
 */
export function DiffPanel({
  useSessions,
  openFile,
  gitStatus,
  gitDiff,
  gitStatusEntries,
  gitStage,
  gitUnstage,
  gitDiscard,
  t,
}: DiffPanelProps): ReactNode {
  const cwd = currentCwd(useSessions)
  const [available, setAvailable] = useState(false)
  const [files, setFiles] = useState<DiffFile[]>([])
  const [entries, setEntries] = useState<GitStatusEntry[] | null>(null)
  const [truncated, setTruncated] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [openPaths, setOpenPaths] = useState<ReadonlySet<string>>(new Set())
  const [discardPath, setDiscardPath] = useState<string | null>(null)
  const [generation, setGeneration] = useState(0)

  const reload = useCallback(() => { setGeneration(n => n + 1) }, [])

  useEffect(() => {
    const onFocus = (): void => { reload() }
    window.addEventListener('focus', onFocus)
    return () => { window.removeEventListener('focus', onFocus) }
  }, [reload])

  useEffect(() => {
    if (cwd === undefined) {
      setAvailable(false)
      setFiles([])
      setEntries(null)
      setTruncated(false)
      setError(null)
      return
    }
    let cancelled = false
    void Promise.all([gitStatus(cwd), gitDiff(cwd), gitStatusEntries(cwd)]).then(([status, diff, porcelain]) => {
      if (cancelled) return
      if (status === null || diff === null) {
        setAvailable(false)
        setFiles([])
        setEntries(null)
        setTruncated(false)
        setError(null)
        return
      }
      setAvailable(true)
      setFiles(diff.files)
      setTruncated(diff.truncated === true)
      setEntries(porcelain?.ok === true ? porcelain.entries ?? [] : null)
      setOpenPaths(new Set(diff.files.map(file => file.path)))
      setError(null)
    }).catch(() => {
      if (!cancelled) setError(t('error.load'))
    })
    return () => { cancelled = true }
  }, [cwd, gitStatus, gitDiff, gitStatusEntries, t, generation])

  const toggle = (path: string): void => {
    const next = new Set(openPaths)
    if (next.has(path)) next.delete(path)
    else next.add(path)
    setOpenPaths(next)
  }

  const runOp = async (
    op: (cwd: string, relativePath: string) => Promise<{ ok: boolean; message?: string }>,
    relativePath: string,
  ): Promise<void> => {
    /* v8 ignore next -- stage actions are not rendered without a cwd. */
    if (cwd === undefined) return
    const result = await op(cwd, relativePath)
    if (!result.ok) {
      setError(result.message ?? t('error.load'))
      return
    }
    reload()
  }

  const hunksFor = (path: string): ReactNode => {
    const file = files.find(entry => entry.path === path)
    if (file === undefined) return null
    return (
      <div className={css.hunks}>
        {file.hunks.map((hunk, index) => (
          <div key={`${path}:${index}`} className={css.hunk}>
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
    )
  }

  const fileRow = (path: string, actions: ReactNode): ReactNode => (
    <div
      key={path}
      onClick={(event: MouseEvent<HTMLDivElement>) => {
        const target = event.target as HTMLElement
        if (target.closest(`.${css.fileTitle}`) !== null) openFile(path)
      }}
    >
      <DisclosureRow
        icon={<IconCodeOutline16 size={14} />}
        title={path}
        titleClassName={css.fileTitle}
        open={openPaths.has(path)}
        expandable
        onToggle={() => { toggle(path) }}
        collapsedContent={actions}
        keepContentWhenOpen
      >
        {hunksFor(path)}
      </DisclosureRow>
    </div>
  )

  const staged = entries?.filter(entry => isStaged(entry.xy)) ?? []
  const unstaged = entries?.filter(entry => isUnstaged(entry.xy)) ?? []

  return (
    <div className={css.root} data-diff-panel>
      <div className={css.header} data-surface-subheader>
        <h3 className={css.title}>{t('title')}</h3>
        <Tooltip label={t('refresh')} side="bottom">
          <button
            type="button"
            className={css.refresh}
            aria-label={t('refresh')}
            onClick={() => { reload() }}
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
        ) : !available ? (
          <p className={css.message} data-diff-unavailable>{t('unavailable')}</p>
        ) : entries !== null ? (
          <>
            {truncated ? <p className={css.message}>{t('truncated')}</p> : null}
            {staged.length === 0 && unstaged.length === 0 ? (
              <p className={css.message}>{t('empty.changes')}</p>
            ) : (
              <>
                {staged.length > 0 ? (
                  <section>
                    <h4 className={css.group}>{t('group.staged')}</h4>
                    {staged.map(entry => fileRow(entry.path, (
                      <button
                        type="button"
                        className={css.action}
                        onClick={(event) => {
                          event.stopPropagation()
                          void runOp(gitUnstage, entry.path)
                        }}
                      >
                        {t('unstage')}
                      </button>
                    )))}
                  </section>
                ) : null}
                {unstaged.length > 0 ? (
                  <section>
                    <h4 className={css.group}>{t('group.unstaged')}</h4>
                    {unstaged.map(entry => fileRow(entry.path, (
                      <>
                        <button
                          type="button"
                          className={css.action}
                          onClick={(event) => {
                            event.stopPropagation()
                            void runOp(gitStage, entry.path)
                          }}
                        >
                          {t('stage')}
                        </button>
                        <button
                          type="button"
                          className={css.action}
                          onClick={(event) => {
                            event.stopPropagation()
                            setDiscardPath(entry.path)
                          }}
                        >
                          {t('discard')}
                        </button>
                      </>
                    )))}
                  </section>
                ) : null}
              </>
            )}
          </>
        ) : files.length === 0 ? (
          <p className={css.message}>{t('empty.changes')}</p>
        ) : (
          <>
            {truncated ? <p className={css.message}>{t('truncated')}</p> : null}
            {files.map(file => fileRow(file.path, null))}
          </>
        )}
      </div>
      <Modal
        open={discardPath !== null}
        onClose={() => { setDiscardPath(null) }}
        title={t('discard.title')}
        closeLabel={t('discard.cancel')}
        description={t('discard.body')}
        footer={(
          <>
            <Button variant="ghost" onClick={() => { setDiscardPath(null) }}>{t('discard.cancel')}</Button>
            <Button
              variant="primary"
              onClick={() => {
                const path = discardPath
                setDiscardPath(null)
                /* v8 ignore next -- confirm is only rendered while discardPath is set. */
                if (path !== null) void runOp(gitDiscard, path)
              }}
            >
              {t('discard.confirm')}
            </Button>
          </>
        )}
      />
    </div>
  )
}
