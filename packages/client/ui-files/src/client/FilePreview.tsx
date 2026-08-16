import { useEffect, useState, type ReactNode } from 'react'
import { MarkdownText } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { NS } from './locales.ts'
import type { FilesShellInjected } from './shell.ts'
import css from './FilePreview.module.css'

export type FilePreviewProps =
  & PropsRuntime<'surfaces.file'>
  & PropsLocale<typeof NS>
  & InjectFace<FilesShellInjected>

const IMAGE_EXT = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico', 'avif'])

function currentCwd(useSessions: FilePreviewProps['useSessions']): string | undefined {
  return useSessions((s) => {
    const id = s.current
    const next = id === undefined ? undefined : s.byId[id]?.cwd
    return next ? next : undefined
  })
}

function fileName(relativePath: string): string {
  const slash = relativePath.lastIndexOf('/')
  return slash < 0 ? relativePath : relativePath.slice(slash + 1)
}

function extensionOf(relativePath: string): string {
  const slash = relativePath.lastIndexOf('/')
  const base = slash < 0 ? relativePath : relativePath.slice(slash + 1)
  const dot = base.lastIndexOf('.')
  if (dot < 0) return ''
  return base.slice(dot + 1).toLowerCase()
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
  readFileMedia,
  t,
}: FilePreviewProps): ReactNode {
  const cwd = currentCwd(useSessions)
  const ext = extensionOf(relativePath)
  const isImage = IMAGE_EXT.has(ext)
  const isMarkdown = ext === 'md'
  const [text, setText] = useState<string>('')
  const [media, setMedia] = useState<{ mime: string; base64: string } | null>(null)
  const [binary, setBinary] = useState(false)
  const [truncated, setTruncated] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (cwd === undefined) {
      setError(t('empty.cwd'))
      setText('')
      setMedia(null)
      return
    }
    let cancelled = false
    const applyError = (message: string): void => {
      setError(message)
      setText('')
      setMedia(null)
    }
    if (isImage) {
      void readFileMedia(cwd, relativePath).then((result) => {
        if (cancelled) return
        if (!result.ok || result.mime === undefined || result.base64 === undefined) {
          applyError(result.message ?? t('error.read'))
          return
        }
        setError(null)
        setBinary(false)
        setTruncated(result.truncated === true)
        setMedia({ mime: result.mime, base64: result.base64 })
        setText('')
      }).catch(() => {
        if (!cancelled) applyError(t('error.read'))
      })
    } else {
      void readFile(cwd, relativePath).then((result) => {
        if (cancelled) return
        if (!result.ok) {
          applyError(result.message ?? t('error.read'))
          return
        }
        setError(null)
        setBinary(result.binary === true)
        setTruncated(result.truncated === true)
        setText(result.text ?? '')
        setMedia(null)
      }).catch(() => {
        if (!cancelled) applyError(t('error.read'))
      })
    }
    return () => { cancelled = true }
  }, [cwd, relativePath, readFile, readFileMedia, t, isImage])

  const codeLabels = { copyLabel: t('preview.copy'), copiedLabel: t('preview.copied') }

  return (
    <div className={css.root} data-file-preview>
      <div className={css.header} data-surface-subheader>
        <h3 className={css.title}>{fileName(relativePath)}</h3>
        <p className={css.path}>{relativePath}</p>
      </div>
      <div className={css.body}>
        {error !== null ? (
          <p className={css.message}>{error}</p>
        ) : media !== null ? (
          <>
            {truncated ? <p className={css.message}>{t('preview.truncated')}</p> : null}
            <img
              className={css.image}
              alt={fileName(relativePath)}
              src={`data:${media.mime};base64,${media.base64}`}
            />
          </>
        ) : binary ? (
          <p className={css.message}>{t('preview.binary')}</p>
        ) : isMarkdown ? (
          <>
            {truncated ? <p className={css.message}>{t('preview.truncated')}</p> : null}
            <MarkdownText text={text} codeLabels={codeLabels} />
          </>
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
