/**
 * Titlebar branch picker: a trigger showing the current ref and an anchored
 * panel with search, create-branch, and checkout. Interaction follows T3code's
 * branch selector (adapted, MIT); chrome is this design system's tokens.
 * @module @deepseek-ai/dsh-client-ui-git/client/BranchMenu
 */

import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import {
  IconBranchOutline16,
  IconChevronDownOutline14,
  IconPlusOutline16,
  IconSearchOutline16,
  Input,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { NS } from './locales.ts'
import type { GitResult } from './git-logic.ts'
import {
  dedupeRemoteBranchesWithLocalMatches,
  orderBranchRefs,
  shouldIncludeBranchPickerItem,
  type BranchRef,
} from './branches.ts'
import css from './BranchMenu.module.css'

/** Branch methods the picker needs from the desktop shell. */
export interface BranchMenuOps {
  gitBranchList: (cwd: string) => Promise<{ ok: boolean; message?: string; branches?: BranchRef[] }>
  gitSwitchBranch: (cwd: string, ref: string) => Promise<GitResult & { refName?: string }>
  gitCreateBranch: (cwd: string, name: string) => Promise<GitResult & { refName?: string }>
}

/** Full props of the branch picker. */
export interface BranchMenuProps extends BranchMenuOps {
  /** Workspace directory the titlebar Git cluster resolved. */
  cwd: string | undefined
  /** Current ref name from the status snapshot, for the trigger label. */
  currentRef: string | null
  /** Locale function from the git namespace. */
  t: PropsLocale<typeof NS>['t']
  /** Notify the parent to refresh status after a switch/create. */
  onChanged: () => void
}

/**
 * Render the branch picker trigger and panel.
 * @param props - shell ops, cwd, current ref, copy, and change callback.
 * @returns the picker, or nothing outside a repository.
 */
export function BranchMenu({ cwd, currentRef, t, onChanged, gitBranchList, gitSwitchBranch, gitCreateBranch }: BranchMenuProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [refs, setRefs] = useState<BranchRef[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const anchorRef = useRef<HTMLSpanElement | null>(null)

  useEffect(() => {
    if (!open) {
      setQuery('')
      setError(null)
      return
    }
    let cancelled = false
    if (cwd === undefined) return
    setError(null)
    void gitBranchList(cwd).then((result) => {
      if (cancelled) return
      if (result.ok) setRefs(result.branches ?? [])
      else {
        setRefs(null)
        setError(result.message ?? t('branch.error'))
      }
    })
    return () => { cancelled = true }
  }, [open, cwd, gitBranchList, t])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent): void => {
      if (anchorRef.current !== null && !anchorRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => { document.removeEventListener('pointerdown', onPointerDown) }
  }, [open])

  const normalizedQuery = query.trim().toLowerCase()
  const localNames = new Set((refs ?? []).filter(ref => !ref.isRemote).map(ref => ref.name))
  const trimmedQuery = query.trim()
  const canCreate = trimmedQuery.length > 0 && !localNames.has(trimmedQuery)
  const createValue = canCreate ? `__create__:${trimmedQuery}` : null

  const rows = orderBranchRefs(dedupeRemoteBranchesWithLocalMatches(refs ?? []))
    .filter(ref => shouldIncludeBranchPickerItem({
      itemValue: ref.name,
      normalizedQuery,
      createBranchItemValue: createValue,
    }))

  const runAction = (action: () => Promise<void>): void => {
    if (busy || cwd === undefined) return
    setBusy(true)
    setError(null)
    void action().finally(() => {
      setBusy(false)
      onChanged()
    })
  }

  const onSwitch = (ref: BranchRef): void => {
    if (cwd === undefined) return
    runAction(async () => {
      const result = await gitSwitchBranch(cwd, ref.name)
      if (result.ok) setOpen(false)
      else setError(result.message ?? t('branch.error'))
    })
  }

  const onCreate = (): void => {
    if (cwd === undefined) return
    const name = trimmedQuery
    runAction(async () => {
      const result = await gitCreateBranch(cwd, name)
      if (result.ok) setOpen(false)
      else setError(result.message ?? t('branch.error'))
    })
  }

  const onSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Escape') {
      event.stopPropagation()
      setOpen(false)
    }
    if (event.key === 'Enter' && canCreate) {
      event.preventDefault()
      onCreate()
    }
  }

  /** Focus the search box (the Input atom does not forward refs). */
  const focusSearch = (): void => {
    anchorRef.current?.querySelector('input')?.focus()
  }

  const label = currentRef ?? t('branch.select')

  return (
    <span className={css.anchor} ref={anchorRef}>
      <button
        type="button"
        className={css.trigger}
        aria-label={t('branch.open')}
        aria-expanded={open}
        disabled={busy || cwd === undefined}
        onClick={() => { setOpen(next => !next) }}
      >
        <IconBranchOutline16 size={14} />
        <span className={css.name}>{label}</span>
        <IconChevronDownOutline14 size={12} />
      </button>
      {open && (
        <div className={css.panel} role="dialog" aria-label={t('branch.open')}>
          <Input
            className={css.search ?? ''}
            icon={<IconSearchOutline16 size={14} />}
            value={query}
            placeholder={t('branch.search')}
            autoFocus
            disabled={busy}
            onChange={(event) => { setQuery(event.target.value) }}
            onKeyDown={onSearchKeyDown}
          />
          <div className={css.list}>
            {rows.map(ref => (
              <button
                key={ref.name}
                type="button"
                className={css.row}
                disabled={busy || ref.isCurrent}
                onClick={() => { onSwitch(ref) }}
              >
                <span className={css.rowName}>{ref.name}</span>
                <span className={css.badge}>
                  {ref.isCurrent
                    ? t('branch.current')
                    : ref.isDefault
                      ? t('branch.default')
                      : ref.isRemote
                        ? t('branch.remote')
                        : ''}
                </span>
              </button>
            ))}
            {refs !== null && rows.length === 0 && (
              <div className={css.empty}>{t('branch.empty')}</div>
            )}
            <button
              type="button"
              className={`${css.row} ${css.createRow} ${canCreate ? '' : css.createRowHint}`}
              disabled={busy}
              aria-label={canCreate ? t('branch.createNamed', { name: trimmedQuery }) : t('branch.createHint')}
              onClick={() => { if (canCreate) onCreate(); else focusSearch() }}
            >
              <span className={css.createLabel}>
                <IconPlusOutline16 size={14} />
                <span className={css.rowName}>
                  {canCreate ? t('branch.createNamed', { name: trimmedQuery }) : t('branch.createHint')}
                </span>
              </span>
            </button>
          </div>
          {error !== null && <div className={css.error} role="alert">{error}</div>}
        </div>
      )}
    </span>
  )
}

