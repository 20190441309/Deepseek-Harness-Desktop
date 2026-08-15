/** Desktop-only General row: close button hides to tray or quits the app. */
import { useEffect, useState } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import { IconChevronDownOutline14, Menu } from '@deepseek-ai/dsh-client-ui-primitives'
import { desktopShell } from './desktop-shell.ts'
import type { SettingsKey } from './locales.ts'
import css from './CloseBehaviorRow.module.css'

/** Full Settings-row props. */
export type CloseBehaviorRowProps =
  PropsRuntime<'settings.general.item'>
  & PropsLocale<'settings'>

const OPTIONS: readonly { id: 'tray' | 'quit'; label: SettingsKey }[] = [
  { id: 'tray', label: 'closeBehavior.tray' },
  { id: 'quit', label: 'closeBehavior.quit' },
]

/**
 * Render the close-window preference selector.
 * @param props - composed Settings slot props.
 * @returns the preference row.
 */
export function CloseBehaviorRow({ t }: CloseBehaviorRowProps) {
  const [closeToTray, setCloseToTray] = useState(true)
  const [open, setOpen] = useState(false)
  const shell = desktopShell()

  useEffect(() => {
    let cancelled = false
    void shell?.getConfig?.().then((config) => {
      if (!cancelled && typeof config?.closeToTray === 'boolean') {
        setCloseToTray(config.closeToTray)
      }
    }).catch(() => {
      // Keep the tray default when the desktop config cannot be read.
    })
    return () => { cancelled = true }
  }, [shell])

  const selected = closeToTray ? 'tray' : 'quit'

  return (
    <div className={css.row}>
      <div className={css.rowText}>
        <div className={css.title}>{t('closeBehavior.title')}</div>
        <div className={css.desc}>{t('closeBehavior.description')}</div>
      </div>
      <Menu
        open={open}
        onClose={() => { setOpen(false) }}
        items={OPTIONS.map(option => ({ id: option.id, label: t(option.label) }))}
        selectedId={selected}
        onSelect={(id) => {
          setOpen(false)
          const next = id === 'tray'
          setCloseToTray(next)
          void shell?.saveConfig?.({ closeToTray: next })
        }}
        align="end"
        portal
        anchor={(
          <button
            type="button"
            className={css.selector}
            aria-haspopup="menu"
            aria-expanded={open}
            onClick={() => { setOpen(value => !value) }}
          >
            {t(closeToTray ? 'closeBehavior.tray' : 'closeBehavior.quit')}
            <IconChevronDownOutline14 className={css.chevron} />
          </button>
        )}
      />
    </div>
  )
}
