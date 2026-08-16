/**
 * Settings MCP page: managed catalog plus read-only composition rows.
 */

import { useEffect, useState } from 'react'
import type { McpServerEntry, McpServerRecord, McpServerSnapshot } from '@deepseek-ai/dsh-api-remotes/client'
import { Button, Input, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { McpSettingsKey } from './locales.ts'
import styles from './McpSection.module.css'

const NAME = /^[A-Za-z0-9_-]{1,32}$/

/** Injected Host Remote wrappers. */
export interface McpSectionInjected {
  list: () => Promise<McpServerSnapshot>
  upsert: (spec: McpServerRecord) => Promise<void>
  remove: (id: string) => Promise<void>
  setEnabled: (id: string, enabled: boolean) => Promise<void>
  t: (key: McpSettingsKey) => string
}

/** Slot props for `settings.section` id `mcp`. */
export type McpSectionProps =
  PropsRuntime<'settings.section'>
  & PropsLocale<'settings.mcp'>
  & InjectFace<McpSectionInjected>

type View =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; snapshot: McpServerSnapshot }

const PHASE: Record<Exclude<McpServerEntry['fiberPhase'], null>, McpSettingsKey> = {
  pending: 'pending',
  loading: 'loadingPhase',
  active: 'active',
  failed: 'failed',
  unloading: 'unloading',
}

/**
 * Render the MCP settings page.
 * @param props - inject face flattened by the slot renderer.
 */
export function McpSection(props: McpSectionProps) {
  const t = props.t
  const [view, setView] = useState<View>({ status: 'loading' })
  const [editor, setEditor] = useState<McpServerRecord | 'new' | undefined>()
  const [deleting, setDeleting] = useState<McpServerEntry | undefined>()
  const [failure, setFailure] = useState<string | undefined>()

  const reload = (): void => {
    setView({ status: 'loading' })
    void props.list()
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

  return (
    <div className={styles.section}>
      <h2 className={styles.title}>{t('title')}</h2>
      <p className={styles.intro}>{t('intro')}</p>
      <div className={styles.toolbar}>
        <Button variant="primary" onClick={() => { setEditor('new'); setFailure(undefined) }}>{t('add')}</Button>
      </div>
      {view.snapshot.servers.length === 0
        ? <p className={styles.empty}>{t('empty')}</p>
        : (
          <ul className={styles.rows}>
            {view.snapshot.servers.map(entry => (
              <li key={entry.id} className={styles.row}>
                <div className={styles.rowHead}>
                  <div className={styles.identity}>
                    <span className={styles.name}>{entry.spec.serverName}</span>
                    <span className={styles.meta}>
                      {entry.spec.transport === 'stdio' ? t('stdio') : t('http')}
                      {' · '}
                      {entry.origin === 'managed' ? t('managed') : t('composition')}
                      {' · '}
                      {entry.fiberPhase === null ? t('unobserved') : t(PHASE[entry.fiberPhase])}
                      {' · '}
                      {entry.enabled ? t('enabled') : t('disabled')}
                    </span>
                  </div>
                </div>
                <div className={styles.actions}>
                  {entry.writable
                    ? (
                      <>
                        <Button size="sm" onClick={() => {
                          void props.setEnabled(entry.id, !entry.enabled).then(reload).catch(error => {
                            setFailure(messageOf(error, t('saveFailed')))
                          })
                        }}
                        >
                          {entry.enabled ? t('disable') : t('enable')}
                        </Button>
                        <Button size="sm" onClick={() => { setEditor(entry.spec); setFailure(undefined) }}>{t('edit')}</Button>
                        <Button size="sm" onClick={() => { setDeleting(entry); setFailure(undefined) }}>{t('remove')}</Button>
                      </>
                    )
                    : <span className={styles.meta}>{t('readOnly')}</span>}
                </div>
              </li>
            ))}
          </ul>
        )}
      {failure === undefined ? null : <p className={styles.notice} role="alert">{failure}</p>}
      <EditorModal
        open={editor !== undefined}
        draft={editor === 'new' || editor === undefined ? emptyDraft() : editor}
        creating={editor === 'new'}
        t={t}
        onClose={() => { setEditor(undefined) }}
        onSave={(spec) => {
          void props.upsert(spec)
            .then(() => { setEditor(undefined); reload() })
            .catch(error => { setFailure(messageOf(error, t('saveFailed'))) })
        }}
      />
      <Modal
        open={deleting !== undefined}
        onClose={() => { setDeleting(undefined) }}
        title={format(t('deleteTitle'), { name: deleting?.spec.serverName ?? '' })}
        closeLabel={t('close')}
        description={format(t('deleteBody'), { name: deleting?.spec.serverName ?? '' })}
        footer={(
          <>
            <Button onClick={() => { setDeleting(undefined) }}>{t('cancel')}</Button>
            <Button
              variant="primary"
              onClick={() => {
                if (deleting === undefined) return
                void props.remove(deleting.id)
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

function EditorModal({
  open, draft, creating, t, onClose, onSave,
}: {
  open: boolean
  draft: McpServerRecord
  creating: boolean
  t: McpSectionInjected['t']
  onClose: () => void
  onSave: (spec: McpServerRecord) => void
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
              const spec = validate(form, t)
              if (typeof spec === 'string') {
                setLocalError(spec)
                return
              }
              onSave(spec)
            }}
          >
            {t('save')}
          </Button>
        </>
      )}
    >
      <div className={styles.form}>
        <label className={styles.field}>
          <span className={styles.label}>{t('id')}</span>
          <Input value={form.id} disabled={!creating} onChange={event => { setForm({ ...form, id: event.target.value, serverName: creating ? event.target.value : form.serverName }) }} />
        </label>
        <label className={styles.field}>
          <span className={styles.label}>{t('serverName')}</span>
          <Input value={form.serverName} onChange={event => { setForm({ ...form, serverName: event.target.value }) }} />
        </label>
        <label className={styles.field}>
          <span className={styles.label}>{t('transport')}</span>
          <select
            value={form.transport}
            onChange={(event) => {
              const transport = event.target.value === 'streamable-http' ? 'streamable-http' : 'stdio'
              setForm(transport === 'stdio'
                ? { id: form.id, enabled: form.enabled, transport, serverName: form.serverName, command: '' }
                : { id: form.id, enabled: form.enabled, transport, serverName: form.serverName, url: '' })
            }}
          >
            <option value="stdio">{t('stdio')}</option>
            <option value="streamable-http">{t('http')}</option>
          </select>
        </label>
        {form.transport === 'stdio'
          ? (
            <>
              <label className={styles.field}>
                <span className={styles.label}>{t('command')}</span>
                <Input value={form.command} onChange={event => { setForm({ ...form, command: event.target.value }) }} />
              </label>
              <label className={styles.field}>
                <span className={styles.label}>{t('args')}</span>
                <textarea className={styles.textarea} value={(form.args ?? []).join('\n')} onChange={event => { setForm({ ...form, args: lines(event.target.value) }) }} />
              </label>
              <label className={styles.field}>
                <span className={styles.label}>{t('env')}</span>
                <textarea className={styles.textarea} value={pairs(form.env)} onChange={event => { setForm({ ...form, env: parsePairs(event.target.value) }) }} />
              </label>
              <label className={styles.field}>
                <span className={styles.label}>{t('cwd')}</span>
                <Input value={form.cwd ?? ''} onChange={event => { setForm({ ...form, cwd: event.target.value }) }} />
              </label>
            </>
          )
          : (
            <>
              <label className={styles.field}>
                <span className={styles.label}>{t('url')}</span>
                <Input value={form.url} onChange={event => { setForm({ ...form, url: event.target.value }) }} />
              </label>
              <label className={styles.field}>
                <span className={styles.label}>{t('headers')}</span>
                <textarea className={styles.textarea} value={pairs(form.headers)} onChange={event => { setForm({ ...form, headers: parsePairs(event.target.value) }) }} />
              </label>
            </>
          )}
        {localError === undefined ? null : <p className={styles.notice}>{localError}</p>}
      </div>
    </Modal>
  )
}

function emptyDraft(): McpServerRecord {
  return { id: '', enabled: true, transport: 'stdio', serverName: '', command: '' }
}

function validate(form: McpServerRecord, t: McpSectionInjected['t']): McpServerRecord | string {
  if (!NAME.test(form.id) || !NAME.test(form.serverName)) return t('idRequired')
  if (form.transport === 'stdio' && form.command.trim().length === 0) return t('commandRequired')
  if (form.transport === 'streamable-http' && form.url.trim().length === 0) return t('urlRequired')
  return form
}

function lines(value: string): string[] {
  return value.split(/\r?\n/).map(item => item.trim()).filter(item => item.length > 0)
}

function pairs(values: Readonly<Record<string, string>> | undefined): string {
  return Object.entries(values ?? {}).map(([key, value]) => `${key}=${value}`).join('\n')
}

function parsePairs(text: string): Record<string, string> {
  const result: Record<string, string> = {}
  for (const line of lines(text)) {
    const index = line.indexOf('=')
    if (index <= 0) continue
    result[line.slice(0, index)] = line.slice(index + 1)
  }
  return result
}

function format(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => vars[key] ?? '')
}

function messageOf(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.length > 0 ? error.message : fallback
}
