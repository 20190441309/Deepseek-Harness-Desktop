import { useEffect, useState, type ReactNode } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { NS } from './locales.ts'
import type { FilesShellInjected } from './shell.ts'
import css from './FilePreview.module.css'

export type FilePreviewProps =
  & PropsRuntime<'surfaces.file'>
  & PropsLocale<typeof NS>
  & InjectFace<FilesShellInjected>

function currentCwd(useSessions: FilePreviewProps['useSessions']): string | undefined {
  return useSessions(s => {
    const id = s.current
    const next = id === undefined ? undefined : s.byId[id]?.cwd
    return next ? next : undefined
  })
}

function fileName(relativePath: string): string {
  const slash = relativePath.lastIndexOf('/')
  return slash < 0 ? relativePath : relativePath.slice(slash + 1)
}

/**
 * Single-file preview occupant of `surfaces.file`.
 * @param props - session-maybe seats, relativePath owner, read IPC, and copy.
 * @returns the preview panel.
 */
export function FilePreview({
  useSessions,
  relativePath,
  readFile,
  t,
}: FilePreviewProps): ReactNode {
  const cwd = currentCwd(useSessions)
  const [text, setText] = useState<string>('')
  const [binary, setBinary] = useState(false)
  const [truncated, setTruncated] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (cwd === undefined) {
      setError(t('empty.cwd'))
      setText('')
      return
    }
    let cancelled = false
    void readFile(cwd, relativePath).then(result => {
      if (cancelled) return
      if (!result.ok) {
        setError(result.message ?? t('error.read'))
        setText('')
        return
      }
      setError(null)
      setBinary(result.binary === true)
      setTruncated(result.truncated === true)
      setText(result.text ?? '')
    })
    return () => { cancelled = true }
  }, [cwd, relativePath, readFile, t])

  return (
    <div className={css.root} data-file-preview>
      <div className={css.header} data-surface-subheader>
        <h3 className={css.title}>{fileName(relativePath)}</h3>
        <p className={css.path}>{relativePath}</p>
      </div>
      <div className={css.body}>
        {error !== null ? (
          <p className={css.message}>{error}</p>
        ) : binary ? (
          <p className={css.message}>{t('preview.binary')}</p>
        ) : (
          <>
            {truncated ? <p className={css.message}>{t('preview.truncated')}</p> : null}
            <pre className={css.code}>{text}</pre>
          </>
        )}
      </div>
    </div>
  )
}
