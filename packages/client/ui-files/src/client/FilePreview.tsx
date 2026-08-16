import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Button, MarkdownText } from '@deepseek-ai/dsh-client-ui-primitives'
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
 * Single-file occupant of `surfaces.file`. Clean text that is not truncated can
 * be edited and saved through desktop `writeFile`. The occupant rereads disk
 * when `active` becomes true. Save rereads first and refuses once when disk
 * diverged from both the remembered baseline and the draft. A dirty draft stays
 * in the editor (Markdown Source included) when the last reread failed, returned
 * truncated or binary bytes, or ran without a cwd; Save writes whenever cwd
 * exists. A successful write clears truncated/binary so the editor remains.
 * Ctrl/Cmd+S saves only while this tab is active. The surfaces shell persists
 * dirty buffers across reload.
 * @param props - session-maybe seats, relativePath owner, read/write IPC, and copy.
 * @returns the preview panel.
 */
export function FilePreview({
  useSessions,
  relativePath,
  active,
  onDirtyChange,
  readBuffer,
  writeBuffer,
  registerSave,
  readFile,
  readFileMedia,
  writeFile,
  t,
}: FilePreviewProps): ReactNode {
  const cwd = currentCwd(useSessions)
  const ext = extensionOf(relativePath)
  const isImage = IMAGE_EXT.has(ext)
  const isMarkdown = ext === 'md'
  const seed = readBuffer()
  const [text, setText] = useState<string>(() => seed?.text ?? '')
  const [draft, setDraft] = useState<string>(() => seed?.draft ?? '')
  const [media, setMedia] = useState<{ mime: string; base64: string } | null>(null)
  const [binary, setBinary] = useState(false)
  const [truncated, setTruncated] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [renderMarkdown, setRenderMarkdown] = useState(true)
  const [saved, setSaved] = useState(false)
  const [ready, setReady] = useState(seed !== undefined)
  const loadedRef = useRef(seed !== undefined)
  const textRef = useRef(seed?.text ?? '')
  const draftRef = useRef(seed?.draft ?? '')
  textRef.current = text
  draftRef.current = draft

  const readBufferRef = useRef(readBuffer)
  readBufferRef.current = readBuffer
  const writeBufferRef = useRef(writeBuffer)
  writeBufferRef.current = writeBuffer

  useEffect(() => {
    if (cwd === undefined) {
      setError(t('empty.cwd'))
      setSaveError(null)
      // Keep text/draft: a transient missing cwd must not wipe unsaved edits.
      return
    }
    if (!active && loadedRef.current) return
    let cancelled = false
    const markReady = (): void => {
      loadedRef.current = true
      setReady(true)
    }
    const applyError = (message: string): void => {
      const remembered = readBufferRef.current()
      setError(message)
      setSaveError(null)
      setMedia(null)
      if (remembered !== undefined && remembered.draft !== remembered.text) {
        setText(remembered.text)
        setDraft(remembered.draft)
        markReady()
        return
      }
      if (draftRef.current !== textRef.current) {
        markReady()
        return
      }
      setText('')
      setDraft('')
      writeBufferRef.current(null)
      markReady()
    }
    if (isImage) {
      void readFileMedia(cwd, relativePath).then((result) => {
        if (cancelled) return
        if (!result.ok || result.mime === undefined || result.base64 === undefined) {
          applyError(result.message ?? t('error.read'))
          return
        }
        setError(null)
        setSaveError(null)
        setBinary(false)
        setTruncated(result.truncated === true)
        setMedia({ mime: result.mime, base64: result.base64 })
        setText('')
        setDraft('')
        writeBufferRef.current(null)
        markReady()
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
        setSaveError(null)
        setBinary(result.binary === true)
        setTruncated(result.truncated === true)
        const next = result.text ?? ''
        const remembered = readBufferRef.current()
        const localDirty = draftRef.current !== textRef.current
        if (localDirty) {
          setText(next)
          setDraft(draftRef.current)
          writeBufferRef.current({ text: next, draft: draftRef.current })
        } else if (remembered !== undefined && remembered.draft !== remembered.text) {
          setText(next)
          setDraft(remembered.draft)
          writeBufferRef.current({ text: next, draft: remembered.draft })
        } else if (remembered !== undefined && remembered.text === next) {
          setText(remembered.text)
          setDraft(remembered.draft)
        } else {
          setText(next)
          setDraft(next)
          writeBufferRef.current({ text: next, draft: next })
        }
        setMedia(null)
        setSaved(false)
        markReady()
      }).catch(() => {
        if (!cancelled) applyError(t('error.read'))
      })
    }
    return () => { cancelled = true }
  }, [cwd, relativePath, readFile, readFileMedia, t, isImage, active])

  const editable = ready && error === null && !isImage && !binary && !truncated
  // Dirty tracks buffer divergence even when cwd/error/truncated/binary block a
  // clean preview, so tab-close confirm still runs and Save/Source stay reachable.
  const dirty = !isImage && draft !== text
  const canSave = cwd !== undefined && dirty
  const showEditor = ready && !isImage && (dirty || editable)
  const codeLabels = { copyLabel: t('preview.copy'), copiedLabel: t('preview.copied') }

  const onDirtyChangeRef = useRef(onDirtyChange)
  onDirtyChangeRef.current = onDirtyChange
  useEffect(() => {
    onDirtyChangeRef.current(dirty)
  }, [dirty])
  useEffect(() => () => { onDirtyChangeRef.current(false) }, [])

  useEffect(() => {
    if (!loadedRef.current) return
    if (isImage) return
    writeBufferRef.current({ text, draft })
  }, [isImage, text, draft])

  const saveRef = useRef<() => Promise<boolean>>(async () => false)
  const save = async (): Promise<boolean> => {
    if (cwd === undefined || !dirty) return false
    try {
      const latest = await readFile(cwd, relativePath)
      if (
        latest.ok
        && latest.binary !== true
        && latest.truncated !== true
        && typeof latest.text === 'string'
        && latest.text !== text
        && latest.text !== draft
      ) {
        setText(latest.text)
        writeBufferRef.current({ text: latest.text, draft })
        setSaveError(t('error.changed'))
        return false
      }
      const result = await writeFile(cwd, relativePath, draft)
      if (!result.ok) {
        setSaveError(result.message ?? t('error.write'))
        return false
      }
      setSaveError(null)
      setError(null)
      setTruncated(false)
      setBinary(false)
      setText(draft)
      writeBufferRef.current({ text: draft, draft })
      setSaved(true)
      window.setTimeout(() => { setSaved(false) }, 1200)
      return true
    } catch {
      setSaveError(t('error.write'))
      return false
    }
  }
  saveRef.current = save

  useEffect(() => {
    registerSave(() => saveRef.current())
    return () => { registerSave(null) }
  }, [registerSave])

  useEffect(() => {
    if (!active || !canSave) return
    const onKeyDown = (event: KeyboardEvent): void => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 's') return
      event.preventDefault()
      void saveRef.current()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => { window.removeEventListener('keydown', onKeyDown) }
  }, [active, canSave])


  return (
    <div className={css.root} data-file-preview>
      <div className={css.toolbar}>
        <p className={css.path}>{relativePath}</p>
        {isMarkdown && (editable || dirty) ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setRenderMarkdown(open => !open) }}
          >
            {renderMarkdown ? t('preview.source') : t('preview.render')}
          </Button>
        ) : null}
        {editable || dirty ? (
          <Button
            variant="primary"
            size="sm"
            disabled={!canSave}
            onClick={() => { void save() }}
          >
            {saved ? t('preview.saved') : t('preview.save')}
          </Button>
        ) : null}
      </div>
      <div className={css.body}>
        {saveError !== null ? (
          <p className={css.saveError} role="alert">{saveError}</p>
        ) : null}
        {error !== null ? (
          <p className={css.message}>{error}</p>
        ) : null}
        {media !== null ? (
          <>
            {truncated ? <p className={css.message}>{t('preview.truncated')}</p> : null}
            <img
              className={css.image}
              alt={fileName(relativePath)}
              src={`data:${media.mime};base64,${media.base64}`}
            />
          </>
        ) : binary && !dirty ? (
          <p className={css.message}>{t('preview.binary')}</p>
        ) : !ready ? (
          null
        ) : showEditor ? (
          <>
            {truncated ? <p className={css.message}>{t('preview.truncated')}</p> : null}
            {binary ? <p className={css.message}>{t('preview.binary')}</p> : null}
            {isMarkdown && renderMarkdown ? (
              <MarkdownText text={draft} codeLabels={codeLabels} />
            ) : (
              <textarea
                className={css.editor}
                value={draft}
                aria-label={relativePath}
                onChange={event => {
                  const next = event.target.value
                  setDraft(next)
                  writeBufferRef.current({ text: textRef.current, draft: next })
                }}
              />
            )}
          </>
        ) : truncated ? (
          <>
            <p className={css.message}>{t('preview.truncated')}</p>
            {isMarkdown ? (
              <MarkdownText text={text} codeLabels={codeLabels} />
            ) : (
              <pre className={css.code}>{text}</pre>
            )}
          </>
        ) : null}
      </div>
    </div>
  )
}
