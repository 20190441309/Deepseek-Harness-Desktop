/**
 * SettingsSelect: Setting-Cell Selector pill (figma Selector h36 r18) backed by
 * {@link Menu}. Replaces native `<select>` in settings forms so the open list
 * uses the shared menu surface instead of the OS dropdown.
 */

import { useState } from 'react'
import type { ReactNode } from 'react'
import clsx from 'clsx'
import { IconChevronDownOutline14 } from './icons/index.tsx'
import { Menu } from './Menu.tsx'
import css from './SettingsSelect.module.css'

/** One selectable row. */
export interface SettingsSelectOption {
  /** Stable option id (also the value written on change). */
  id: string
  /** Visible label. */
  label: string
  /** Non-selectable row. */
  disabled?: boolean
}

/** Props of {@link SettingsSelect}. */
export interface SettingsSelectProps {
  /** Currently selected option id, or empty when none. */
  value: string
  /** Options shown in the menu. */
  options: readonly SettingsSelectOption[]
  /** Commit a new selection. */
  onChange: (id: string) => void
  /** Accessible name of the trigger. */
  'aria-label': string
  /** Disable the trigger and block opens. */
  disabled?: boolean
  /**
   * Label shown when `value` is empty or matches no option.
   * Defaults to an empty string so the trigger stays a blank pill.
   */
  placeholder?: string
  /**
   * `inline` — compact pill (Setting-Cell trailing control).
   * `block` — full-width trigger for form fields (vision model, protocol, …).
   */
  variant?: 'inline' | 'block'
  /** Extra class on the outer wrapper. */
  className?: string | undefined
}

/**
 * Render a Menu-backed settings selector.
 * @param props - value, options, and chrome.
 * @returns the selector.
 */
export function SettingsSelect({
  value,
  options,
  onChange,
  'aria-label': ariaLabel,
  disabled = false,
  placeholder = '',
  variant = 'inline',
  className,
}: SettingsSelectProps): ReactNode {
  const [open, setOpen] = useState(false)
  const selected = options.find(option => option.id === value)
  const label = selected?.label ?? (value === '' ? placeholder : value)

  return (
    <div className={clsx(css.root, variant === 'block' && css.block, className)}>
      <Menu
        open={open && !disabled}
        onClose={() => { setOpen(false) }}
        items={options.map(option => ({
          id: option.id,
          label: option.label,
          ...(option.disabled === true ? { disabled: true as const } : {}),
        }))}
        selectedId={selected === undefined ? undefined : value}
        onSelect={(id) => {
          onChange(id)
          setOpen(false)
        }}
        align="start"
        portal
        anchor={(
          <button
            type="button"
            className={css.trigger}
            aria-label={ariaLabel}
            aria-haspopup="menu"
            aria-expanded={open && !disabled}
            disabled={disabled}
            onClick={() => { setOpen(current => !current) }}
          >
            <span className={clsx(css.label, selected === undefined && value === '' && placeholder !== '' && css.placeholder)}>
              {label}
            </span>
            <IconChevronDownOutline14 className={css.chevron} />
          </button>
        )}
      />
    </div>
  )
}
