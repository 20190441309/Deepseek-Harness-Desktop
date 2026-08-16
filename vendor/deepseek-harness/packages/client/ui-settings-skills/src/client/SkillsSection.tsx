/**
 * Settings Skills page: searchable flat catalog with a local editor.
 */

import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import type {
  SkillInventoryDetail,
  SkillInventoryEntry,
  SkillInventorySnapshot,
} from '@deepseek-ai/dsh-api-remotes/client'
import type { SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import {
  Button,
  IconPlusOutline16,
  IconRefreshOutline16,
  IconSearchOutline16,
  IconSkillOutline16,
  IconTrashOutline16,
  Input,
  Menu,
  Modal,
  Pill,
  Switch,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SkillsSettingsKey } from './locales.ts'
import styles from './SkillsSection.module.css'

const NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

type SkillCreateRoot = 'user-dsh' | 'project-dsh'
type SourceFilter = 'all' | 'user' | 'project' | 'bundled' | 'other'
type RowAction = 'detail' | 'invocation'
type FieldErrors = Partial<Record<'name' | 'description' | 'content', string>>

interface SkillInventoryClientScope {
  sessionId?: SessionId
  cwd?: string
}

interface SkillCreateInput extends SkillInventoryClientScope {
  name: string
  description: string
  whenToUse?: string
  content: string
  root: SkillCreateRoot
  modelInvocable: boolean
  userInvocable: boolean
}

interface EditorDraft {
  name: string
  description: string
  whenToUse?: string
  content: string
  root: SkillCreateRoot
  modelInvocable: boolean
  userInvocable: boolean
}

/** Injected Host Remote wrappers. */
export interface SkillsSectionInjected {
  list: (scope: SkillInventoryClientScope) => Promise<SkillInventorySnapshot>
  get: (name: string, scope: SkillInventoryClientScope) => Promise<SkillInventoryDetail>
  create: (input: SkillCreateInput) => Promise<void>
  update: (input: SkillInventoryClientScope & {
    name: string
    description: string
    whenToUse?: string
    content: string
    modelInvocable: boolean
    userInvocable: boolean
  }) => Promise<void>
  remove: (name: string, scope: SkillInventoryClientScope) => Promise<void>
  setInvocation: (
    name: string,
    modelInvocable: boolean,
    userInvocable: boolean,
    scope: SkillInventoryClientScope,
  ) => Promise<void>
  t: (key: SkillsSettingsKey) => string
}

/** Slot props for `settings.section` id `skills`. */
export type SkillsSectionProps =
  PropsRuntime<'settings.section'>
  & PropsLocale<'settings.skills'>
  & InjectFace<SkillsSectionInjected>

type View =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; snapshot: SkillInventorySnapshot }

type EditorState =
  | { mode: 'create' }
  | { mode: 'edit'; detail: SkillInventoryDetail }

/** Render the Skills settings page. */
export function SkillsSection(props: SkillsSectionProps) {
  const t = props.t
  const sessionId = props.useSessions(sessions => sessions.current)
  const rawCwd = props.useSessions((sessions) => {
    const current = sessions.current
    return current === undefined ? undefined : sessions.byId[current]?.cwd
  })
  const observedCwd = rawCwd === undefined || rawCwd.trim().length === 0 ? undefined : rawCwd
  // A session's cwd never changes once set, but a sessions-store rebuild can
  // make the current entry read undefined for one render. Keep the last known
  // cwd per session so a flicker cannot silently rescope the catalog request
  // to the no-project view.
  const lastKnownCwd = useRef<Map<string, string>>(new Map())
  if (sessionId !== undefined && observedCwd !== undefined) {
    lastKnownCwd.current.set(sessionId, observedCwd)
  }
  const rememberedCwd = sessionId === undefined ? undefined : lastKnownCwd.current.get(sessionId)
  const cwd = observedCwd ?? rememberedCwd
  const scope: SkillInventoryClientScope = {
    ...sessionId === undefined ? {} : { sessionId },
    ...cwd === undefined ? {} : { cwd },
  }
  const scopeGeneration = useRef(0)
  const loadSequence = useRef(0)
  const [view, setView] = useState<View>({ status: 'loading' })
  const [query, setQuery] = useState('')
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all')
  const [sourceMenuOpen, setSourceMenuOpen] = useState(false)
  const [details, setDetails] = useState<Readonly<Record<string, SkillInventoryDetail>>>({})
  const [pendingRows, setPendingRows] = useState<Readonly<Record<string, RowAction | undefined>>>({})
  const [rowErrors, setRowErrors] = useState<Readonly<Record<string, string | undefined>>>({})
  const [editor, setEditor] = useState<EditorState | undefined>()
  const [editorPending, setEditorPending] = useState(false)
  const [editorError, setEditorError] = useState<string | undefined>()
  const [deleting, setDeleting] = useState<SkillInventoryEntry | undefined>()
  const [deletePending, setDeletePending] = useState(false)
  const [deleteError, setDeleteError] = useState<string | undefined>()
  const [refreshFailure, setRefreshFailure] = useState(false)

  const load = (replace: boolean): void => {
    const sequence = loadSequence.current + 1
    loadSequence.current = sequence
    if (replace) setView({ status: 'loading' })
    void props.list(scope)
      .then((snapshot) => {
        if (loadSequence.current !== sequence) return
        setView({ status: 'ready', snapshot })
        setRefreshFailure(false)
      })
      .catch(() => {
        if (loadSequence.current !== sequence) return
        if (replace) setView({ status: 'error' })
        else setRefreshFailure(true)
      })
  }

  useEffect(() => {
    setDetails({})
    setPendingRows({})
    setRowErrors({})
    setEditor(undefined)
    setEditorPending(false)
    setEditorError(undefined)
    setDeleting(undefined)
    setDeletePending(false)
    setDeleteError(undefined)
    setRefreshFailure(false)
    scopeGeneration.current += 1
    load(true)
    return () => {
      scopeGeneration.current += 1
      loadSequence.current += 1
    }
  }, [cwd, sessionId, props.list])

  const filtered = view.status !== 'ready' ? [] : view.snapshot.skills.filter((skill) => {
    const needle = query.trim().toLocaleLowerCase()
    const matchesSearch = needle.length === 0 || [skill.name, skill.description, skill.whenToUse ?? '']
      .some(value => value.toLocaleLowerCase().includes(needle))
    return matchesSearch && matchesSource(skill, sourceFilter)
  })

  if (view.status === 'loading') {
    return <div className={styles.section}><p className={styles.intro} role="status">{t('loading')}</p></div>
  }
  if (view.status === 'error') {
    return (
      <div className={styles.section}>
        <p className={styles.error} role="alert">{t('error')}</p>
        <Button variant="outline" onClick={() => { load(true) }}>{t('retry')}</Button>
      </div>
    )
  }

  const setRowPending = (key: string, action: RowAction | undefined): void => {
    setPendingRows(current => ({ ...current, [key]: action }))
  }
  const setRowError = (key: string, message: string | undefined): void => {
    setRowErrors(current => ({ ...current, [key]: message }))
  }
  const cacheDetail = (key: string, detail: SkillInventoryDetail): void => {
    setDetails(current => ({ ...current, [key]: detail }))
  }
  const updateEntry = (key: string, changes: Partial<SkillInventoryEntry>): void => {
    setView(current => current.status !== 'ready' ? current : ({
      status: 'ready',
      snapshot: {
        ...current.snapshot,
        skills: current.snapshot.skills.map(skill => skillKey(skill) === key ? { ...skill, ...changes } : skill),
      },
    }))
    setDetails(current => current[key] === undefined ? current : ({
      ...current,
      [key]: { ...current[key], ...changes },
    }))
  }
  const requestDetail = (skill: SkillInventoryEntry): void => {
    const key = skillKey(skill)
    if (pendingRows[key] !== undefined) return
    const cached = details[key]
    if (cached !== undefined) {
      setEditor({ mode: 'edit', detail: cached })
      return
    }
    const generation = scopeGeneration.current
    setRowPending(key, 'detail')
    setRowError(key, undefined)
    void props.get(skill.name, scope)
      .then((detail) => {
        if (scopeGeneration.current !== generation) return
        cacheDetail(key, detail)
        setEditor({ mode: 'edit', detail })
      })
      .catch((error: unknown) => {
        if (scopeGeneration.current === generation) setRowError(key, messageOf(error, t('detailFailed')))
      })
      .finally(() => {
        if (scopeGeneration.current === generation) setRowPending(key, undefined)
      })
  }
  const setInvocation = (skill: SkillInventoryEntry, modelInvocable: boolean, userInvocable: boolean): void => {
    const key = skillKey(skill)
    if (pendingRows[key] !== undefined) return
    const generation = scopeGeneration.current
    setRowPending(key, 'invocation')
    setRowError(key, undefined)
    void props.setInvocation(skill.name, modelInvocable, userInvocable, scope)
      .then(() => {
        if (scopeGeneration.current === generation) updateEntry(key, { modelInvocable, userInvocable })
      })
      .catch((error: unknown) => {
        if (scopeGeneration.current === generation) setRowError(key, messageOf(error, t('invocationFailed')))
      })
      .finally(() => {
        if (scopeGeneration.current === generation) setRowPending(key, undefined)
      })
  }

  const hasFilters = query.trim().length > 0 || sourceFilter !== 'all'
  const sourceOptions = [
    ['all', t('filterAll')],
    ['user', t('sourceUser')],
    ['project', t('sourceProject')],
    ['bundled', t('sourceBundled')],
    ['other', t('sourceOther')],
  ] as const
  const sourceLabelText = sourceOptions.find(([id]) => id === sourceFilter)?.[1] ?? t('filterAll')

  return (
    <div className={styles.section}>
      <div className={styles.heading}>
        <div>
          <h2 className={styles.title}>{t('title')}</h2>
          <p className={styles.intro}>{t('intro')}</p>
        </div>
        <div className={styles.headingActions}>
          <Button
            size="sm"
            variant="outline"
            className={styles.iconAction}
            icon={<IconPlusOutline16 />}
            aria-label={t('add')}
            onClick={() => { setEditor({ mode: 'create' }); setEditorError(undefined) }}
          />
          <Button
            size="sm"
            variant="outline"
            className={styles.iconAction}
            icon={<IconRefreshOutline16 />}
            aria-label={t('refresh')}
            onClick={() => { load(false) }}
          />
        </div>
      </div>

      {cwd === undefined ? <p className={styles.scopeNotice}>{t('projectCatalogUnavailable')}</p> : null}
      {refreshFailure ? (
        <div className={styles.loadFailure}>
          <p role="alert">{t('refreshFailed')}</p>
          <Button variant="outline" onClick={() => { load(false) }}>{t('retry')}</Button>
        </div>
      ) : null}

      <div className={styles.searchRow}>
        <Input
          {...styles.search === undefined ? {} : { className: styles.search }}
          type="search"
          value={query}
          icon={<IconSearchOutline16 />}
          aria-label={t('searchLabel')}
          placeholder={t('searchPlaceholder')}
          onChange={(event) => { setQuery(event.target.value) }}
        />
        <Menu
          open={sourceMenuOpen}
          align="end"
          portal
          anchor={(
            <Button
              size="sm"
              variant="outline"
              aria-label={t('sourceFilter')}
              aria-haspopup="menu"
              aria-expanded={sourceMenuOpen}
              onClick={() => { setSourceMenuOpen(open => !open) }}
            >
              {sourceLabelText}
            </Button>
          )}
          items={sourceOptions.map(([id, label]) => ({ id, label }))}
          selectedId={sourceFilter}
          onSelect={(id) => { setSourceFilter(id as SourceFilter); setSourceMenuOpen(false) }}
          onClose={() => { setSourceMenuOpen(false) }}
        />
      </div>

      <p className={styles.resultCount} aria-live="polite">
        {format(t('resultCount'), { count: String(filtered.length) })}
        {hasFilters && (
          <Button
            className={styles.clearFilters}
            size="sm"
            onClick={() => {
              setQuery('')
              setSourceFilter('all')
            }}
          >
            {t('clearFilters')}
          </Button>
        )}
      </p>

      {view.snapshot.skills.length === 0
        ? <p className={styles.empty}>{t('empty')}</p>
        : filtered.length === 0
          ? <p className={styles.empty}>{t('noResults')}</p>
          : (
            <ul className={styles.rows}>
              {filtered.map((skill) => {
                const key = skillKey(skill)
                const pending = pendingRows[key]
                const rowError = rowErrors[key]
                return (
                  <li key={key} className={styles.row}>
                    <button
                      type="button"
                      className={styles.rowMain}
                      disabled={!skill.writable}
                      onClick={() => {
                        if (!skill.writable || pending !== undefined) return
                        setEditorError(undefined)
                        requestDetail(skill)
                      }}
                    >
                      <span className={styles.skillIcon}><IconSkillOutline16 /></span>
                      <span className={styles.summary}>
                        <span className={styles.name}>{skill.name}</span>
                        <span className={styles.description}>{skill.description}</span>
                      </span>
                    </button>
                    <div className={styles.rowMeta}>
                      {pending === 'detail' && <span className={styles.pending} role="status">{t('loadingDetail')}</span>}
                      <Pill>{t(sourceLabel(skill.source))}</Pill>
                      <Switch
                        checked={skill.modelInvocable}
                        disabled={!skill.writable || pending === 'invocation'}
                        aria-label={format(t('modelFor'), { name: skill.name })}
                        onChange={(event: ChangeEvent<HTMLInputElement>) => {
                          setInvocation(skill, event.target.checked, skill.userInvocable)
                        }}
                      />
                      {skill.writable && (
                        <button
                          type="button"
                          className={styles.iconButton}
                          aria-label={format(t('removeFor'), { name: skill.name })}
                          onClick={() => {
                            setDeleteError(undefined)
                            setDeleting(skill)
                          }}
                        >
                          <IconTrashOutline16 />
                        </button>
                      )}
                    </div>
                    {rowError !== undefined && <p className={styles.rowError} role="alert">{rowError}</p>}
                  </li>
                )
              })}
            </ul>
          )}

      <SkillEditor
        open={editor !== undefined}
        creating={editor?.mode === 'create'}
        draft={editor?.mode === 'edit' ? editorDraft(editor.detail) : emptySkill()}
        cwd={cwd}
        pending={editorPending}
        submitError={editorError}
        t={t}
        onClose={() => { if (!editorPending) setEditor(undefined) }}
        onSave={(draft) => {
          if (editor === undefined) return
          const activeEditor = editor
          const generation = scopeGeneration.current
          setEditorPending(true)
          setEditorError(undefined)
          const whenToUse = optionalWhenToUse(draft.whenToUse)
          const work = activeEditor.mode === 'create'
            ? props.create({
              name: draft.name,
              description: draft.description.trim(),
              ...whenToUse,
              content: draft.content,
              root: draft.root,
              modelInvocable: draft.modelInvocable,
              userInvocable: draft.userInvocable,
              ...scope,
            })
            : props.update({
              name: draft.name,
              description: draft.description.trim(),
              ...whenToUse,
              content: draft.content,
              modelInvocable: draft.modelInvocable,
              userInvocable: draft.userInvocable,
              ...scope,
            })
          void work
            .then(() => {
              if (scopeGeneration.current !== generation) return
              if (activeEditor.mode === 'edit') {
                const key = skillKey(activeEditor.detail)
                const entryChanges = {
                  description: draft.description.trim(),
                  modelInvocable: draft.modelInvocable,
                  userInvocable: draft.userInvocable,
                }
                const detailChanges = {
                  ...entryChanges,
                  content: draft.content,
                  ...draft.whenToUse === undefined || draft.whenToUse.trim().length === 0
                    ? {}
                    : { whenToUse: draft.whenToUse.trim() },
                }
                const detailBase = { ...activeEditor.detail }
                delete detailBase.whenToUse
                updateEntry(key, entryChanges)
                cacheDetail(key, { ...detailBase, ...detailChanges })
              }
              setEditor(undefined)
              setEditorPending(false)
              load(false)
            })
            .catch((error: unknown) => {
              if (scopeGeneration.current !== generation) return
              setEditorError(messageOf(error, t('saveFailed')))
              setEditorPending(false)
            })
        }}
      />

      <Modal
        open={deleting !== undefined}
        onClose={() => { if (!deletePending) setDeleting(undefined) }}
        title={format(t('deleteTitle'), { name: deleting?.name ?? '' })}
        closeLabel={t('close')}
        description={format(t('deleteBody'), { name: deleting?.name ?? '' })}
        footer={(
          <>
            <Button disabled={deletePending} onClick={() => { setDeleting(undefined) }}>{t('cancel')}</Button>
            <Button
              variant="primary"
              disabled={deletePending}
              onClick={() => {
                if (deleting === undefined) return
                const target = deleting
                const generation = scopeGeneration.current
                setDeletePending(true)
                setDeleteError(undefined)
                void props.remove(target.name, scope)
                  .then(() => {
                    if (scopeGeneration.current !== generation) return
                    const removedKey = skillKey(target)
                    setView(current => current.status !== 'ready' ? current : ({
                      status: 'ready',
                      snapshot: {
                        ...current.snapshot,
                        skills: current.snapshot.skills.filter(skill => skillKey(skill) !== removedKey),
                      },
                    }))
                    setDeletePending(false)
                    setDeleting(undefined)
                  })
                  .catch((error: unknown) => {
                    if (scopeGeneration.current !== generation) return
                    setDeleteError(messageOf(error, t('deleteFailed')))
                    setDeletePending(false)
                  })
              }}
            >
              {deletePending ? t('deleting') : t('deleteConfirm')}
            </Button>
          </>
        )}
      >
        {deleteError !== undefined && <p className={styles.modalError} role="alert">{deleteError}</p>}
      </Modal>
    </div>
  )
}

function SkillEditor({ open, creating, draft, cwd, pending, submitError, t, onClose, onSave }: {
  open: boolean
  creating: boolean
  draft: EditorDraft
  cwd: string | undefined
  pending: boolean
  submitError: string | undefined
  t: SkillsSectionInjected['t']
  onClose: () => void
  onSave: (draft: EditorDraft) => void
}) {
  const [form, setForm] = useState(draft)
  const [errors, setErrors] = useState<FieldErrors>({})
  useEffect(() => { setForm(draft); setErrors({}) }, [draft.name, open])

  const setField = <K extends keyof EditorDraft>(field: K, value: EditorDraft[K]): void => {
    setForm(current => ({ ...current, [field]: value }))
    if (field === 'name' || field === 'description' || field === 'content') {
      setErrors(current => ({ ...current, [field]: undefined }))
    }
  }
  const validate = (): FieldErrors => {
    const next: FieldErrors = {}
    if (!NAME.test(form.name)) next.name = t('nameRequired')
    if (form.description.trim().length === 0) next.description = t('descriptionRequired')
    if (form.content.trim().length === 0) next.content = t('contentRequired')
    return next
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={creating ? t('editorTitleAdd') : t('editorTitleEdit')}
      closeLabel={t('close')}
      {...styles.editorModal === undefined ? {} : { className: styles.editorModal }}
      {...styles.editorContent === undefined ? {} : { contentClassName: styles.editorContent }}
      footer={(
        <>
          <Button disabled={pending} onClick={onClose}>{t('cancel')}</Button>
          <Button
            variant="primary"
            disabled={pending}
            onClick={() => {
              const next = validate()
              setErrors(next)
              if (Object.values(next).some(Boolean)) return
              onSave(form)
            }}
          >
            {pending ? t('saving') : t('save')}
          </Button>
        </>
      )}
    >
      <div className={styles.form}>
        {creating && (
          <fieldset className={styles.scopeField}>
            <legend className={styles.label}>{t('scope')}</legend>
            <div className={styles.scopeOptions}>
              <Pill active={form.root === 'user-dsh'} aria-pressed={form.root === 'user-dsh'} onClick={() => { setField('root', 'user-dsh') }}>
                {t('scopeUser')}
              </Pill>
              <Pill
                active={form.root === 'project-dsh'}
                aria-pressed={form.root === 'project-dsh'}
                disabled={cwd === undefined}
                onClick={() => { setField('root', 'project-dsh') }}
              >
                {t('scopeProject')}
              </Pill>
            </div>
            {cwd === undefined && <span className={styles.fieldHint}>{t('projectUnavailable')}</span>}
            {cwd !== undefined && form.root === 'project-dsh' && <span className={styles.fieldHint}>{format(t('projectPath'), { cwd })}</span>}
          </fieldset>
        )}
        <label className={styles.field}>
          <span className={styles.label}>{t('name')}</span>
          <Input
            value={form.name}
            aria-label={t('name')}
            disabled={!creating || pending}
            aria-invalid={errors.name !== undefined}
            aria-describedby={errors.name === undefined ? undefined : 'skill-name-error'}
            onChange={(event) => { setField('name', event.target.value) }}
          />
          {errors.name !== undefined && <span id="skill-name-error" className={styles.fieldError}>{errors.name}</span>}
        </label>
        <label className={styles.field}>
          <span className={styles.label}>{t('description')}</span>
          <Input
            value={form.description}
            aria-label={t('description')}
            disabled={pending}
            aria-invalid={errors.description !== undefined}
            aria-describedby={errors.description === undefined ? undefined : 'skill-description-error'}
            onChange={(event) => { setField('description', event.target.value) }}
          />
          {errors.description !== undefined && <span id="skill-description-error" className={styles.fieldError}>{errors.description}</span>}
        </label>
        <label className={styles.field}>
          <span className={styles.label}>{t('whenToUse')}</span>
          <textarea
            className={styles.whenTextarea}
            aria-label={t('whenToUse')}
            value={form.whenToUse ?? ''}
            disabled={pending}
            onChange={(event) => { setField('whenToUse', event.target.value) }}
          />
        </label>
        <label className={styles.field}>
          <span className={styles.label}>{t('content')}</span>
          <textarea
            className={styles.textarea}
            aria-label={t('content')}
            value={form.content}
            disabled={pending}
            aria-invalid={errors.content !== undefined}
            aria-describedby={errors.content === undefined ? undefined : 'skill-content-error'}
            onChange={(event) => { setField('content', event.target.value) }}
          />
          {errors.content !== undefined && <span id="skill-content-error" className={styles.fieldError}>{errors.content}</span>}
        </label>
        <fieldset className={styles.invocationEditor} disabled={pending}>
          <legend className={styles.label}>{t('invocationTitle')}</legend>
          <label className={styles.switchRow}>
            <span>
              <span className={styles.switchLabel}>{t('model')}</span>
              <span className={styles.switchHint}>{t('modelHint')}</span>
            </span>
            <Switch checked={form.modelInvocable} onChange={(event: ChangeEvent<HTMLInputElement>) => { setField('modelInvocable', event.target.checked) }} />
          </label>
          <label className={styles.switchRow}>
            <span>
              <span className={styles.switchLabel}>{t('user')}</span>
              <span className={styles.switchHint}>{t('userHint')}</span>
            </span>
            <Switch checked={form.userInvocable} onChange={(event: ChangeEvent<HTMLInputElement>) => { setField('userInvocable', event.target.checked) }} />
          </label>
        </fieldset>
        {submitError !== undefined && <p className={styles.modalError} role="alert">{submitError}</p>}
      </div>
    </Modal>
  )
}

function emptySkill(): EditorDraft {
  return {
    name: '',
    description: '',
    root: 'user-dsh',
    modelInvocable: true,
    userInvocable: true,
    content: '',
  }
}

function editorDraft(detail: SkillInventoryDetail): EditorDraft {
  return {
    name: detail.name,
    description: detail.description,
    ...detail.whenToUse === undefined ? {} : { whenToUse: detail.whenToUse },
    content: detail.content,
    root: detail.source === 'project-dsh' ? 'project-dsh' : 'user-dsh',
    modelInvocable: detail.modelInvocable,
    userInvocable: detail.userInvocable,
  }
}

function skillKey(skill: Pick<SkillInventoryEntry, 'source' | 'name'>): string {
  return `${skill.source}:${skill.name}`
}

function sourceBucket(source: string): Exclude<SourceFilter, 'all'> {
  if (source === 'user-dsh' || source === 'user-agents') return 'user'
  if (source === 'project-dsh' || source === 'project-agents') return 'project'
  if (source === 'bundled') return 'bundled'
  return 'other'
}

function sourceLabel(source: string): SkillsSettingsKey {
  const bucket = sourceBucket(source)
  if (bucket === 'user') return 'sourceUser'
  if (bucket === 'project') return 'sourceProject'
  if (bucket === 'bundled') return 'sourceBundled'
  return 'sourceOther'
}

function matchesSource(skill: SkillInventoryEntry, filter: SourceFilter): boolean {
  return filter === 'all' || sourceBucket(skill.source) === filter
}

function format(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => vars[key] ?? '')
}

function messageOf(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.length > 0 ? error.message : fallback
}

function optionalWhenToUse(value: string | undefined): { whenToUse: string } | object {
  return value === undefined || value.trim().length === 0 ? {} : { whenToUse: value.trim() }
}
