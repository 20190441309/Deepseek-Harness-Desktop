import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  Button,
  IconBranchOutline16,
  IconChevronDownOutline14,
  IconCommitOutline16,
  IconPullRequestOutline16,
  IconPushOutline16,
  Menu,
  Modal,
  Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {
  DefaultBranchConfirmableAction,
  GitActionIconName,
  GitResult,
  GitStackedAction,
  VcsStatus,
} from './git-logic.ts'
import {
  buildMenuItems,
  requiresDefaultBranchConfirmation,
  resolveQuickAction,
} from './git-logic.ts'
import { NS } from './locales.ts'
import { BranchMenu } from './BranchMenu.tsx'
import type { BranchRef } from './branches.ts'
import css from './GitActionsControl.module.css'

/** Desktop git IPC the plugin injects from `window.shell`. */
export interface GitActionsInjected {
  gitStatus: (cwd: string) => Promise<VcsStatus | null>
  gitInit: (cwd: string) => Promise<GitResult>
  gitCommit: (cwd: string, message: string) => Promise<GitResult>
  gitPush: (cwd: string) => Promise<GitResult>
  gitPull: (cwd: string) => Promise<GitResult>
  gitCreateChangeRequest: (cwd: string, input: { title: string; body: string }) => Promise<GitResult>
  gitBranchList: (cwd: string) => Promise<{ ok: boolean; message?: string; branches?: BranchRef[] }>
  gitSwitchBranch: (cwd: string, ref: string) => Promise<GitResult & { refName?: string }>
  gitCreateBranch: (cwd: string, name: string) => Promise<GitResult & { refName?: string }>
  openExternal: (url: string) => Promise<boolean>
}

export type GitActionsProps =
  PropsRuntime<'shell.titlebar.trailing'>
  & PropsLocale<typeof NS>
  & InjectFace<GitActionsInjected>

interface PendingDefaultBranchAction {
  action: DefaultBranchConfirmableAction
  branchName: string
  includesCommit: boolean
  commitMessage?: string
}

function localizeGitLabel(label: string, t: GitActionsProps['t']): string {
  if (label === 'Commit') return t('action.commit')
  if (label === 'Commit & push') return t('action.commitPush')
  if (label === 'Push') return t('action.push')
  if (label === 'Pull') return t('action.pull')
  if (label === 'Publish repository') return t('action.publish')
  if (label === 'Sync ref') return t('action.sync')
  const pushCreate = 'Push & create '
  if (label.startsWith(pushCreate)) return t('action.pushCreate', { short: label.slice(pushCreate.length) })
  const commitPushCreate = 'Commit, push & '
  if (label.startsWith(commitPushCreate)) {
    return t('action.commitPushCreate', { short: label.slice(commitPushCreate.length) })
  }
  const view = 'View '
  if (label.startsWith(view)) return t('action.view', { short: label.slice(view.length) })
  const create = 'Create '
  if (label.startsWith(create)) return t('action.create', { short: label.slice(create.length) })
  /* v8 ignore next -- git-logic labels are a closed set; unknown strings pass through. */
  return label
}

function iconFor(name: GitActionIconName): ReactNode {
  if (name === 'commit') return <IconCommitOutline16 size={14} />
  if (name === 'push') return <IconPushOutline16 size={14} />
  return <IconPullRequestOutline16 size={14} />
}

function quickIcon(action: { kind: string; action?: string; label: string }): GitActionIconName {
  if (action.kind === 'run_pull') return 'push'
  if (action.kind === 'open_pr' || action.action === 'create_pr' || action.action === 'commit_push_pr') {
    return 'pr'
  }
  if (action.action === 'commit' || action.label === 'Commit') return 'commit'
  return 'push'
}

function localizeDefaultBranchDialog(
  pending: PendingDefaultBranchAction,
  t: GitActionsProps['t'],
): { title: string; description: string; continueLabel: string } {
  const branch = pending.branchName
  const isPush = pending.action === 'push' || pending.action === 'commit_push'
  if (isPush) {
    if (pending.includesCommit) {
      return {
        title: t('confirm.commitPush.title'),
        description: t('confirm.commitPush.description', { branch }),
        continueLabel: t('confirm.commitPush.continue', { branch }),
      }
    }
    return {
      title: t('confirm.push.title'),
      description: t('confirm.push.description', { branch }),
      continueLabel: t('confirm.push.continue', { branch }),
    }
  }
  if (pending.includesCommit) {
    return {
      title: t('confirm.commitPr.title'),
      description: t('confirm.commitPr.description', { branch }),
      continueLabel: t('confirm.commitPr.continue'),
    }
  }
  return {
    title: t('confirm.pr.title'),
    description: t('confirm.pr.description', { branch }),
    continueLabel: t('confirm.pr.continue'),
  }
}

function failureMessage(result: GitResult, fallback: string): string | undefined {
  if (result.ok) return undefined
  const message = result.message?.trim()
  return message !== undefined && message !== '' ? message : fallback
}

/**
 * Render the titlebar Git split button, dropdown, commit dialog, and default-ref confirm.
 * @param props - titlebar owner widths, current-session seats, git IPC, and copy.
 * @returns the split button and any open dialogs.
 */
export function GitActionsControl({
  useSessions,
  gitStatus,
  gitInit,
  gitCommit,
  gitPush,
  gitPull,
  gitCreateChangeRequest,
  gitBranchList,
  gitSwitchBranch,
  gitCreateBranch,
  openExternal,
  t,
}: GitActionsProps): ReactNode {
  const cwd = useSessions((s) => {
    const id = s.current
    const next = id === undefined ? undefined : s.byId[id]?.cwd
    return next ? next : undefined
  })
  const [status, setStatus] = useState<VcsStatus | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [commitOpen, setCommitOpen] = useState(false)
  const [commitMessage, setCommitMessage] = useState('')
  const [pending, setPending] = useState<PendingDefaultBranchAction | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = async (target: string): Promise<VcsStatus | null> => {
    const next = await gitStatus(target)
    setStatus(next)
    setLoaded(true)
    return next
  }

  useEffect(() => {
    if (cwd === undefined) {
      setStatus(null)
      setLoaded(true)
      return
    }
    setLoaded(false)
    let cancelled = false
    void gitStatus(cwd).then((next) => {
      if (cancelled) return
      setStatus(next)
      setLoaded(true)
    })
    return () => { cancelled = true }
  }, [cwd, gitStatus])

  useEffect(() => {
    if (cwd === undefined) return
    const onFocus = (): void => { void refresh(cwd) }
    const onVisibility = (): void => {
      if (document.visibilityState === 'hidden') return
      void refresh(cwd)
    }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [cwd, gitStatus])

  const isDefaultRef = status?.isDefaultRef ?? false
  const hasPrimaryRemote = status?.hasPrimaryRemote ?? false
  const isRepo = status?.isRepo ?? true
  const showInit = loaded && cwd !== undefined && status !== null && ! isRepo
  const quickAction = useMemo(() => {
    if (cwd === undefined) {
      return { label: 'Commit', disabled: true, kind: 'show_hint' as const, hint: t('hint.unavailable') }
    }
    if (!loaded) {
      return { label: 'Commit', disabled: true, kind: 'show_hint' as const, hint: t('hint.busy') }
    }
    const resolved = resolveQuickAction(status, busy, isDefaultRef, hasPrimaryRemote)
    if (resolved.kind === 'open_publish') {
      return {
        label: resolved.label,
        disabled: true,
        kind: 'show_hint' as const,
        hint: t('publish.unavailable'),
      }
    }
    return resolved
  }, [busy, cwd, hasPrimaryRemote, isDefaultRef, loaded, status, t])
  const menuItems = useMemo(
    () => buildMenuItems(status, busy, hasPrimaryRemote),
    [busy, hasPrimaryRemote, status],
  )
  const pendingCopy = pending
    ? localizeDefaultBranchDialog(pending, t)
    : null

  const runInit = (): void => {
    if (cwd === undefined) return
    setBusy(true)
    setError(null)
    void gitInit(cwd).then((result) => {
      const failed = failureMessage(result, t('error.fallback'))
      if (failed !== undefined) setError(failed)
    }).finally(() => {
      setBusy(false)
      void refresh(cwd)
    })
  }

  const runStacked = async (
    action: GitStackedAction,
    options: { commitMessage?: string; skipConfirm?: boolean } = {},
  ): Promise<void> => {
    if (cwd === undefined) return
    const includesCommit = (action === 'commit' || action === 'commit_push' || action === 'commit_push_pr')
      && (action === 'commit' || Boolean(status?.hasWorkingTreeChanges))
    if (
      !options.skipConfirm
      && requiresDefaultBranchConfirmation(action, isDefaultRef)
      && status?.refName
    ) {
      setPending({
        action: action as DefaultBranchConfirmableAction,
        branchName: status.refName,
        includesCommit,
        ...(options.commitMessage ? { commitMessage: options.commitMessage } : {}),
      })
      return
    }
    setBusy(true)
    setError(null)
    const fallback = t('error.fallback')
    try {
      if (includesCommit) {
        const committed = await gitCommit(cwd, options.commitMessage?.trim() || 'Update')
        const failed = failureMessage(committed, fallback)
        if (failed !== undefined) {
          setError(failed)
          return
        }
      }
      const needsPush = action === 'push'
        || action === 'commit_push'
        || action === 'commit_push_pr'
        || (action === 'create_pr' && (!status?.hasUpstream || status.aheadCount > 0 || includesCommit))
      if (needsPush) {
        const pushed = await gitPush(cwd)
        const failed = failureMessage(pushed, fallback)
        if (failed !== undefined) {
          setError(failed)
          return
        }
      }
      if (action === 'create_pr' || action === 'commit_push_pr') {
        const created = await gitCreateChangeRequest(cwd, {
          title: options.commitMessage?.trim() || status?.refName || 'Change',
          body: '',
        })
        const failed = failureMessage(created, fallback)
        if (failed !== undefined) setError(failed)
      }
    } finally {
      setBusy(false)
      await refresh(cwd)
    }
  }

  const runQuick = (): void => {
    if (quickAction.disabled || quickAction.kind === 'show_hint') return
    if (quickAction.kind === 'open_pr') {
      const url = status?.pr?.state === 'open' ? status.pr.url : ''
      if (url) void openExternal(url)
      return
    }
    if (quickAction.kind === 'run_pull') {
      if (cwd === undefined) return
      setBusy(true)
      setError(null)
      void gitPull(cwd).then((result) => {
        const failed = failureMessage(result, t('error.fallback'))
        if (failed !== undefined) setError(failed)
      }).finally(() => {
        setBusy(false)
        void refresh(cwd)
      })
      return
    }
    if (quickAction.action === 'commit') {
      setCommitOpen(true)
      return
    }
    if (quickAction.action) void runStacked(quickAction.action)
  }

  const onMenuSelect = (id: string): void => {
    setMenuOpen(false)
    const item = menuItems.find(entry => entry.id === id)
    if (!item || item.disabled) return
    if (item.kind === 'open_pr') {
      const url = status?.pr?.state === 'open' ? status.pr.url : ''
      if (url) void openExternal(url)
      return
    }
    if (item.dialogAction === 'commit') {
      setCommitOpen(true)
      return
    }
    if (item.dialogAction === 'push') void runStacked('push')
    if (item.dialogAction === 'create_pr') void runStacked('create_pr')
  }

  const hint = quickAction.disabled
    ? (quickAction.hint ?? t('hint.unavailable'))
    : undefined

  const quickLabel = localizeGitLabel(quickAction.label, t)
  const mainButton = (
    <button
      type="button"
      className={css.primary}
      disabled={quickAction.disabled}
      aria-label={quickLabel}
      onClick={runQuick}
    >
      {iconFor(quickIcon(quickAction))}
      <span>{quickLabel}</span>
    </button>
  )

  const initButton = (
    <button
      type="button"
      className={css.init}
      disabled={busy}
      aria-label={t('action.init')}
      onClick={runInit}
    >
      <IconBranchOutline16 size={14} />
      <span>{busy ? t('action.init.busy') : t('action.init')}</span>
    </button>
  )

  return (
    <>
      {showInit ? initButton : (
        <div className={css.split}>
          <BranchMenu
            cwd={cwd}
            currentRef={status?.refName ?? null}
            t={t}
            gitBranchList={gitBranchList}
            gitSwitchBranch={gitSwitchBranch}
            gitCreateBranch={gitCreateBranch}
            onChanged={() => { if (cwd !== undefined) void refresh(cwd) }}
          />
          {hint
            ? <Tooltip label={hint} side="bottom">{mainButton}</Tooltip>
            : mainButton}
          <span className={css.rule} aria-hidden="true" />
          <Menu
            open={menuOpen}
            align="end"
            portal
            anchor={(
              <button
                type="button"
                className={css.chevron}
                aria-label={t('menu.options')}
                disabled={busy}
                onClick={() => {
                  const next = !menuOpen
                  setMenuOpen(next)
                  if (next && cwd !== undefined) void refresh(cwd)
                }}
              >
                <IconChevronDownOutline14 size={14} />
              </button>
            )}
            items={menuItems.map(item => ({
              id: item.id,
              label: localizeGitLabel(item.label, t),
              disabled: item.disabled,
              icon: iconFor(item.icon),
            }))}
            onSelect={onMenuSelect}
            onClose={() => { setMenuOpen(false) }}
          />
        </div>
      )}

      <Modal
        open={!showInit && commitOpen}
        onClose={() => { setCommitOpen(false); setCommitMessage('') }}
        title={t('commit.title')}
        closeLabel={t('commit.cancel')}
        description={t('commit.description')}
        footer={(
          <>
            <Button variant="ghost" size="sm" onClick={() => { setCommitOpen(false); setCommitMessage('') }}>
              {t('commit.cancel')}
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                const message = commitMessage
                setCommitOpen(false)
                setCommitMessage('')
                void runStacked('commit', { commitMessage: message })
              }}
            >
              {t('commit.submit')}
            </Button>
          </>
        )}
      >
        <label className={css.field}>
          <span className={css.fieldLabel}>{t('commit.message')}</span>
          <textarea
            className={css.message}
            value={commitMessage}
            placeholder={t('commit.placeholder')}
            onChange={(event) => { setCommitMessage(event.target.value) }}
          />
        </label>
      </Modal>

      <Modal
        open={error !== null}
        onClose={() => { setError(null) }}
        title={t('error.title')}
        closeLabel={t('error.close')}
        description={error ?? ''}
        footer={(
          <Button variant="primary" size="sm" onClick={() => { setError(null) }}>
            {t('error.close')}
          </Button>
        )}
      />

      <Modal
        open={!showInit && pending !== null}
        onClose={() => { setPending(null) }}
        title={pendingCopy?.title ?? ''}
        closeLabel={t('confirm.abort')}
        {...(pendingCopy?.description !== undefined ? { description: pendingCopy.description } : {})}
        footer={(
          <>
            <Button variant="ghost" size="sm" onClick={() => { setPending(null) }}>
              {t('confirm.abort')}
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                if (!pending) return
                const next = pending
                setPending(null)
                void runStacked(next.action, {
                  skipConfirm: true,
                  ...(next.commitMessage ? { commitMessage: next.commitMessage } : {}),
                })
              }}
            >
              {pendingCopy?.continueLabel}
            </Button>
          </>
        )}
      />
    </>
  )
}
