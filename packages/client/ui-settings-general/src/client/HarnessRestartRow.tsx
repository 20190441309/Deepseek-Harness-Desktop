/**
 * Desktop-only General-settings row for the Harness auto-recovery policy:
 * whether a crashed Harness process restarts itself, and the bounded retry
 * schedule (max attempts, base delay). The row is registered only when the
 * desktop bridge exposes both `getConfig` and `saveConfig`, so this component
 * assumes both exist; it stays inert (loading) if the bridge ever disappears
 * after registration.
 */

import { useCallback, useEffect, useState } from 'react'
import { IconChevronDownOutline14, Menu } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import {
  desktopShell,
  HARNESS_RESTART_BASE_DELAYS_MS,
  HARNESS_RESTART_MAX_ATTEMPTS,
  normalizeHarnessRestart,
  type HarnessRestartConfig,
} from './desktop-shell.ts'
import css from './HarnessRestartRow.module.css'

/** Full component props: the empty item owner share plus the settings locale seat. */
export type HarnessRestartRowProps = PropsRuntime<'settings.general.item'> & PropsLocale<'settings'>

/** Row lifecycle: reading the persisted policy, settled, writing, or failed. */
type RowPhase = 'loading' | 'ready' | 'saving' | 'error'

/**
 * Render the Harness auto-restart preference row.
 * @param props - composed slot props (the section supplies no owner data).
 * @returns the row element tree.
 */
export function HarnessRestartRow({ t }: HarnessRestartRowProps) {
  const shell = desktopShell()
  const [config, setConfig] = useState<HarnessRestartConfig | null>(null)
  const [phase, setPhase] = useState<RowPhase>('loading')
  const [error, setError] = useState('')
  const [attemptsOpen, setAttemptsOpen] = useState(false)
  const [delayOpen, setDelayOpen] = useState(false)
  const current = config ?? normalizeHarnessRestart(undefined)

  useEffect(() => {
    const load = shell?.getConfig
    if (load === undefined) return undefined
    let cancelled = false
    void load().then((next) => {
      if (cancelled) return
      setConfig(normalizeHarnessRestart(next))
      setPhase('ready')
    }).catch((caught: unknown) => {
      if (cancelled) return
      setError(caught instanceof Error ? caught.message : String(caught))
      setPhase('error')
    })
    return () => { cancelled = true }
  }, [shell])

  const save = useCallback(async (patch: Partial<HarnessRestartConfig>) => {
    if (!shell?.saveConfig) return
    setPhase('saving')
    setError('')
    try {
      const saved = await shell.saveConfig(patch)
      setConfig(normalizeHarnessRestart({ ...current, ...patch, ...saved }))
      setPhase('ready')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
      setPhase('error')
    }
  }, [current, shell])

  const busy = phase === 'loading' || phase === 'saving'

  return (
    <div className={css.row}>
      <div className={css.rowText}>
        <div className={css.title}>{t('harnessRestart.title')}</div>
        <div className={css.desc}>{t('harnessRestart.description')}</div>
        {phase === 'loading'
          ? <p className={css.status} role="status">{t('harnessRestart.loading')}</p>
          : phase === 'saving'
            ? <p className={css.status} role="status">{t('harnessRestart.saving')}</p>
            : phase === 'error'
              ? <p className={css.status} role="alert">{t('harnessRestart.error', { message: error })}</p>
              : null}
      </div>
      <div className={css.controls}>
        <label className={css.switch}>
          <input
            type="checkbox"
            role="switch"
            checked={current.harnessAutoRestart}
            disabled={busy}
            aria-label={t('harnessRestart.enable')}
            onChange={(event) => { void save({ harnessAutoRestart: event.target.checked }) }}
          />
        </label>
        <div className={css.pickers}>
          <div className={css.picker}>
            <span className={css.pickerLabel}>{t('harnessRestart.maxAttempts')}</span>
            <Menu
              open={attemptsOpen}
              onClose={() => { setAttemptsOpen(false) }}
              items={HARNESS_RESTART_MAX_ATTEMPTS.map(attempts => ({ id: String(attempts), label: String(attempts) }))}
              selectedId={String(current.harnessRestartMaxAttempts)}
              onSelect={(id) => {
                setAttemptsOpen(false)
                void save({ harnessRestartMaxAttempts: Number(id) })
              }}
              align="end"
              portal
              anchor={(
                <button
                  type="button"
                  className={css.selector}
                  aria-haspopup="menu"
                  aria-expanded={attemptsOpen}
                  aria-label={t('harnessRestart.maxAttempts')}
                  disabled={busy}
                  onClick={() => { setAttemptsOpen(true) }}
                >
                  {current.harnessRestartMaxAttempts}
                  <IconChevronDownOutline14 className={css.chevron} />
                </button>
              )}
            />
          </div>
          <div className={css.picker}>
            <span className={css.pickerLabel}>{t('harnessRestart.baseDelay')}</span>
            <Menu
              open={delayOpen}
              onClose={() => { setDelayOpen(false) }}
              items={HARNESS_RESTART_BASE_DELAYS_MS.map(ms => ({
                id: String(ms),
                label: t('harnessRestart.delay', { count: String(ms / 1000) }),
              }))}
              selectedId={String(current.harnessRestartBaseDelayMs)}
              onSelect={(id) => {
                setDelayOpen(false)
                void save({ harnessRestartBaseDelayMs: Number(id) })
              }}
              align="end"
              portal
              anchor={(
                <button
                  type="button"
                  className={css.selector}
                  aria-haspopup="menu"
                  aria-expanded={delayOpen}
                  aria-label={t('harnessRestart.baseDelay')}
                  disabled={busy}
                  onClick={() => { setDelayOpen(true) }}
                >
                  {t('harnessRestart.delay', { count: String(current.harnessRestartBaseDelayMs / 1000) })}
                  <IconChevronDownOutline14 className={css.chevron} />
                </button>
              )}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
