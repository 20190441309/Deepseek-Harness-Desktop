/**
 * Settings Skills page: catalog grouped by source, with a local editor.
 */

import { useEffect, useState } from 'react'
import type {
  SkillInventoryDetail,
  SkillInventoryEntry,
  SkillInventorySnapshot,
} from '@deepseek-ai/dsh-api-remotes/client'
import { Button, Input, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SkillsSettingsKey } from './locales.ts'
import styles from './SkillsSection.module.css'

const NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/** Injected Host Remote wrappers. */
export interface SkillsSectionInjected {
  list: (cwd?: string) => Promise<SkillInventorySnapshot>
  get: (name: string, cwd?: string) => Promise<SkillInventoryDetail>
  create: (input: { name: string, description: string, whenToUse?: string, content: string }) => Promise<void>
  update: (input: {
    name: string
    description: string
    whenToUse?: string
    content: string
    modelInvocable: boolean
    userInvocable: boolean
    cwd?: string
  }) => Promise<void>
  remove: (name: string, cwd?: string) => Promise<void>
  setInvocation: (name: string, modelInvocable: boolean, userInvocable: boolean, cwd?: string) => Promise<void>
  getCwd: () => string | undefined
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

/**
 * Render the Skills settings page.
 * @param props - inject face flattened by the slot renderer.
 */
export function SkillsSection(props: SkillsSectionProps) {
  const t = props.t
  const cwd = props.getCwd()
  const [view, setView] = useState<View>({ status: 'loading' })
  const [editor, setEditor] = useState<SkillInventoryDetail | 'new' | undefined>()
  const [deleting, setDeleting] = useState<SkillInventoryEntry | undefined>()
  const [failure, setFailure] = useState<string | undefined>()

  const reload = (): void => {
    setView({ status: 'loading' })
    void props.list(cwd)
      .then(snapshot => { setView({ status: 'ready', snapshot }) })
      .catch(() => { setView({ status: 'error' }) })
  }

  useEffect(() => { reload() }, [])

  if (view.status === 'loading') return <div className={styles.section}><p className={styles.intro}>{t('loading')}</p></div>
  if (view.status === 'error') {
    return (
      <div className={styles.section}>
        <p className={styles.error}>{t('error')}</p>
        <Button variant="outline" onClick={reload}>{t('retry')}</Button>
      </div>
    )
  }

  const groups = groupSkills(view.snapshot.skills)
  return (
    <div className={styles.section}>
      <h2 className={styles.title}>{t('title')}</h2>
      <p className={styles.intro}>{t('intro')}</p>
      <div className={styles.toolbar}>
        <Button variant="primary" onClick={() => { setEditor('new'); setFailure(undefined) }}>{t('add')}</Button>
      </div>
      {view.snapshot.skills.length === 0
        ? <p className={styles.empty}>{t('empty')}</p>
        : groups.map(group => (
          <div key={group.id}>
            <p className={styles.group}>{t(group.label)}</p>
            <ul className={styles.rows}>
              {group.skills.map(skill => (
                <li key={`${skill.source}:${skill.name}`} className={styles.row}>
                  <span className={styles.name}>{skill.name}</span>
                  <span className={styles.meta}>
                    {skill.description}
                    {' · '}
                    {skill.modelInvocable ? t('modelOn') : t('modelOff')}
                    {' · '}
                    {skill.userInvocable ? t('userOn') : t('userOff')}
                  </span>
                  <div className={styles.actions}>
                    {skill.writable
                      ? (
                        <>
                          <Button
                            size="sm"
                            onClick={() => {
                              void props.setInvocation(skill.name, !skill.modelInvocable, skill.userInvocable, cwd)
                                .then(reload)
                                .catch(error => { setFailure(messageOf(error, t('saveFailed'))) })
                            }}
                          >
                            {skill.modelInvocable ? t('modelOff') : t('modelOn')}
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => {
                              void props.get(skill.name, cwd)
                                .then(detail => { setEditor(detail); setFailure(undefined) })
                                .catch(error => { setFailure(messageOf(error, t('saveFailed'))) })
                            }}
                          >
                            {t('edit')}
                          </Button>
                          <Button size="sm" onClick={() => { setDeleting(skill); setFailure(undefined) }}>{t('remove')}</Button>
                        </>
                      )
                      : <span className={styles.meta}>{t('readOnly')}</span>}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ))}
      {failure === undefined ? null : <p className={styles.notice} role="alert">{failure}</p>}
      <SkillEditor
        open={editor !== undefined}
        creating={editor === 'new'}
        draft={editor === 'new' || editor === undefined ? emptySkill() : editor}
        t={t}
        onClose={() => { setEditor(undefined) }}
        onSave={(draft) => {
          const whenToUse = optionalWhenToUse(draft.whenToUse)
          const work = editor === 'new'
            ? props.create({
              name: draft.name,
              description: draft.description,
              ...whenToUse,
              content: draft.content,
            })
            : props.update({
              name: draft.name,
              description: draft.description,
              ...whenToUse,
              content: draft.content,
              modelInvocable: draft.modelInvocable,
              userInvocable: draft.userInvocable,
              ...cwd === undefined ? {} : { cwd },
            })
          void work.then(() => { setEditor(undefined); reload() }).catch(error => {
            setFailure(messageOf(error, t('saveFailed')))
          })
        }}
      />
      <Modal
        open={deleting !== undefined}
        onClose={() => { setDeleting(undefined) }}
        title={format(t('deleteTitle'), { name: deleting?.name ?? '' })}
        closeLabel={t('close')}
        description={format(t('deleteBody'), { name: deleting?.name ?? '' })}
        footer={(
          <>
            <Button onClick={() => { setDeleting(undefined) }}>{t('cancel')}</Button>
            <Button
              variant="primary"
              onClick={() => {
                if (deleting === undefined) return
                void props.remove(deleting.name, cwd)
                  .then(() => { setDeleting(undefined); reload() })
                  .catch(error => { setFailure(messageOf(error, t('saveFailed'))) })
              }}
            >
              {t('deleteConfirm')}
            </Button>
          </>
        )}
      />
    </div>
  )
}

function SkillEditor({
  open, creating, draft, t, onClose, onSave,
}: {
  open: boolean
  creating: boolean
  draft: SkillInventoryDetail
  t: SkillsSectionInjected['t']
  onClose: () => void
  onSave: (draft: SkillInventoryDetail) => void
}) {
  const [form, setForm] = useState(draft)
  const [localError, setLocalError] = useState<string | undefined>()
  useEffect(() => { setForm(draft); setLocalError(undefined) }, [draft, open])
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={creating ? t('editorTitleAdd') : t('editorTitleEdit')}
      closeLabel={t('close')}
      footer={(
        <>
          <Button onClick={onClose}>{t('cancel')}</Button>
          <Button
            variant="primary"
            onClick={() => {
              if (!NAME.test(form.name)) {
                setLocalError(t('nameRequired'))
                return
              }
              if (form.description.trim().length === 0) {
                setLocalError(t('descriptionRequired'))
                return
              }
              onSave(form)
            }}
          >
            {t('save')}
          </Button>
        </>
      )}
    >
      <div className={styles.form}>
        <label className={styles.field}>
          <span className={styles.label}>{t('name')}</span>
          <Input value={form.name} disabled={!creating} onChange={event => { setForm({ ...form, name: event.target.value }) }} />
        </label>
        <label className={styles.field}>
          <span className={styles.label}>{t('description')}</span>
          <Input value={form.description} onChange={event => { setForm({ ...form, description: event.target.value }) }} />
        </label>
        <label className={styles.field}>
          <span className={styles.label}>{t('whenToUse')}</span>
          <Input value={form.whenToUse ?? ''} onChange={event => { setForm({ ...form, whenToUse: event.target.value }) }} />
        </label>
        <label className={styles.field}>
          <span className={styles.label}>{t('content')}</span>
          <textarea className={styles.textarea} value={form.content} onChange={event => { setForm({ ...form, content: event.target.value }) }} />
        </label>
        {creating
          ? null
          : (
            <>
              <label className={styles.field}>
                <span className={styles.label}>{t('modelOn')}</span>
                <input
                  type="checkbox"
                  checked={form.modelInvocable}
                  onChange={event => { setForm({ ...form, modelInvocable: event.target.checked }) }}
                />
              </label>
              <label className={styles.field}>
                <span className={styles.label}>{t('userOn')}</span>
                <input
                  type="checkbox"
                  checked={form.userInvocable}
                  onChange={event => { setForm({ ...form, userInvocable: event.target.checked }) }}
                />
              </label>
            </>
          )}
        {localError === undefined ? null : <p className={styles.notice}>{localError}</p>}
      </div>
    </Modal>
  )
}

function emptySkill(): SkillInventoryDetail {
  return {
    name: '',
    description: '',
    source: 'user-dsh',
    writable: true,
    modelInvocable: true,
    userInvocable: true,
    content: '',
  }
}

function groupSkills(skills: readonly SkillInventoryEntry[]): Array<{ id: string, label: SkillsSettingsKey, skills: SkillInventoryEntry[] }> {
  const buckets: Record<'user' | 'project' | 'bundled' | 'other', SkillInventoryEntry[]> = {
    user: [],
    project: [],
    bundled: [],
    other: [],
  }
  for (const skill of skills) {
    if (skill.source === 'user-dsh' || skill.source === 'user-agents') buckets.user.push(skill)
    else if (skill.source === 'project-dsh' || skill.source === 'project-agents') buckets.project.push(skill)
    else if (skill.source === 'bundled') buckets.bundled.push(skill)
    else buckets.other.push(skill)
  }
  return ([
    { id: 'user', label: 'groupUser', skills: buckets.user },
    { id: 'project', label: 'groupProject', skills: buckets.project },
    { id: 'bundled', label: 'groupBundled', skills: buckets.bundled },
    { id: 'other', label: 'groupOther', skills: buckets.other },
  ] as const).filter(group => group.skills.length > 0)
}

function format(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => vars[key] ?? '')
}

function messageOf(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.length > 0 ? error.message : fallback
}

function optionalWhenToUse(value: string | undefined): { whenToUse: string } | object {
  return value === undefined || value.trim().length === 0 ? {} : { whenToUse: value }
}
