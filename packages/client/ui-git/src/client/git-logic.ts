/** T3code Git action state machine over this desktop's VcsStatus JSON. */

/** Provider that owns change-request wording. */
export interface SourceControlProvider {
  kind: 'github' | 'gitlab' | 'azure-devops' | 'bitbucket' | 'unknown'
  name: string
  baseUrl: string
}

/** Open or closed change request attached to the current ref. */
export interface VcsPr {
  number: number
  title: string
  url: string
  baseRef: string
  headRef: string
  state: 'open' | 'closed' | 'merged'
}

/** Minimum VcsStatus JSON the titlebar Git control reads from desktop IPC. */
export interface VcsStatus {
  refName: string | null
  hasWorkingTreeChanges: boolean
  hasUpstream: boolean
  aheadCount: number
  behindCount: number
  aheadOfDefaultCount?: number
  pr: VcsPr | null
  sourceControlProvider?: SourceControlProvider
  isDefaultRef?: boolean
  hasPrimaryRemote?: boolean
  /** False when the cwd is authorized but is not a git work tree. Absent on older payloads. */
  isRepo?: boolean
}

/** Desktop git mutation result. */
export interface GitResult {
  ok: boolean
  message?: string
  url?: string
}

/** Stacked git action the main button or a confirm dialog may run. */
export type GitStackedAction = 'commit' | 'push' | 'create_pr' | 'commit_push' | 'commit_push_pr'

/** Menu-row icon key. */
export type GitActionIconName = 'commit' | 'push' | 'pr'

/** Dialog the menu row opens, when it is not a view-PR link. */
export type GitDialogAction = 'commit' | 'push' | 'create_pr'

/** One dropdown row. */
export interface GitActionMenuItem {
  id: 'commit' | 'push' | 'pr'
  label: string
  disabled: boolean
  icon: GitActionIconName
  kind: 'open_dialog' | 'open_pr'
  dialogAction?: GitDialogAction
}

/** Primary split-button action. */
export interface GitQuickAction {
  label: string
  disabled: boolean
  kind: 'run_action' | 'run_pull' | 'open_pr' | 'open_publish' | 'show_hint'
  action?: GitStackedAction
  hint?: string
}

/** Default-ref confirm copy. */
export interface DefaultBranchActionDialogCopy {
  title: string
  description: string
  continueLabel: string
}

/** Actions that prompt before running on the default ref. */
export type DefaultBranchConfirmableAction = 'push' | 'create_pr' | 'commit_push' | 'commit_push_pr'

/** Provider-specific change-request wording. */
export interface ChangeRequestTerminology {
  shortLabel: string
  singular: string
}

/** GitHub wording used when no provider is known. */
export const DEFAULT_CHANGE_REQUEST_TERMINOLOGY: ChangeRequestTerminology = {
  shortLabel: 'PR',
  singular: 'pull request',
}

/**
 * Resolve change-request wording for a provider.
 * @param provider - discovered provider, or absent for the GitHub default.
 * @returns short and singular labels.
 */
export function getChangeRequestTerminology(
  provider: SourceControlProvider | null | undefined,
): ChangeRequestTerminology {
  if (provider === undefined || provider === null) return DEFAULT_CHANGE_REQUEST_TERMINOLOGY
  switch (provider.kind) {
    case 'gitlab':
      return { shortLabel: 'MR', singular: 'merge request' }
    case 'unknown':
      return { shortLabel: 'change request', singular: 'change request' }
    default:
      return DEFAULT_CHANGE_REQUEST_TERMINOLOGY
  }
}

function resolveChangeRequestTerminology(gitStatus: VcsStatus | null): ChangeRequestTerminology {
  return gitStatus?.sourceControlProvider
    ? getChangeRequestTerminology(gitStatus.sourceControlProvider)
    : DEFAULT_CHANGE_REQUEST_TERMINOLOGY
}

/**
 * Build the three dropdown rows (or commit-only when there is no origin).
 * @param gitStatus - current VcsStatus, or null when git is unavailable.
 * @param isBusy - true while a git action is running.
 * @param hasPrimaryRemote - whether an origin remote exists.
 * @returns menu items; empty when status is null.
 */
export function buildMenuItems(
  gitStatus: VcsStatus | null,
  isBusy: boolean,
  hasPrimaryRemote = true,
): GitActionMenuItem[] {
  if (!gitStatus) return []
  const terminology = resolveChangeRequestTerminology(gitStatus)

  const hasBranch = gitStatus.refName !== null
  const hasChanges = gitStatus.hasWorkingTreeChanges
  const hasOpenPr = gitStatus.pr?.state === 'open'
  const isBehind = gitStatus.behindCount > 0
  const hasDefaultBranchDelta = (gitStatus.aheadOfDefaultCount ?? gitStatus.aheadCount) > 0
  const canPushWithoutUpstream = hasPrimaryRemote && !gitStatus.hasUpstream
  const canCommit = !isBusy && hasChanges
  const canPush =
    !isBusy
    && hasBranch
    && !isBehind
    && gitStatus.aheadCount > 0
    && (gitStatus.hasUpstream || canPushWithoutUpstream)
  const canCreatePr =
    !isBusy
    && hasBranch
    && !hasChanges
    && !hasOpenPr
    && hasDefaultBranchDelta
    && !isBehind
    && (gitStatus.hasUpstream || canPushWithoutUpstream)
  const canOpenPr = !isBusy && hasOpenPr

  const commitItem: GitActionMenuItem = {
    id: 'commit',
    label: 'Commit',
    disabled: !canCommit,
    icon: 'commit',
    kind: 'open_dialog',
    dialogAction: 'commit',
  }

  if (!hasPrimaryRemote) {
    return [commitItem]
  }

  return [
    commitItem,
    {
      id: 'push',
      label: 'Push',
      disabled: !canPush,
      icon: 'push',
      kind: 'open_dialog',
      dialogAction: 'push',
    },
    hasOpenPr
      ? {
        id: 'pr',
        label: `View ${terminology.shortLabel}`,
        disabled: !canOpenPr,
        icon: 'pr',
        kind: 'open_pr',
      }
      : {
        id: 'pr',
        label: `Create ${terminology.shortLabel}`,
        disabled: !canCreatePr,
        icon: 'pr',
        kind: 'open_dialog',
        dialogAction: 'create_pr',
      },
  ]
}

/**
 * Resolve the primary split-button label and action.
 * @param gitStatus - current VcsStatus, or null when git is unavailable.
 * @param isBusy - true while a git action is running.
 * @param isDefaultRef - whether the current ref is the default branch.
 * @param hasPrimaryRemote - whether an origin remote exists.
 * @returns the quick action the main button should show.
 */
export function resolveQuickAction(
  gitStatus: VcsStatus | null,
  isBusy: boolean,
  isDefaultRef = false,
  hasPrimaryRemote = true,
): GitQuickAction {
  if (isBusy) {
    return { label: 'Commit', disabled: true, kind: 'show_hint', hint: 'Git action in progress.' }
  }

  if (!gitStatus) {
    return {
      label: 'Commit',
      disabled: true,
      kind: 'show_hint',
      hint: 'Git status is unavailable.',
    }
  }

  const hasBranch = gitStatus.refName !== null
  const hasChanges = gitStatus.hasWorkingTreeChanges
  const hasOpenPr = gitStatus.pr?.state === 'open'
  const isAhead = gitStatus.aheadCount > 0
  const hasDefaultBranchDelta = (gitStatus.aheadOfDefaultCount ?? gitStatus.aheadCount) > 0
  const isBehind = gitStatus.behindCount > 0
  const isDiverged = isAhead && isBehind
  const terminology = resolveChangeRequestTerminology(gitStatus)
  // Captured before the !hasUpstream early return below, so the type stays
  // boolean instead of narrowing to literal true by line 330.
  const canViewPr = hasOpenPr && gitStatus.hasUpstream

  if (!hasBranch) {
    return {
      label: 'Commit',
      disabled: true,
      kind: 'show_hint',
      hint: `Create and checkout a ref before pushing or opening a ${terminology.singular}.`,
    }
  }

  if (hasChanges) {
    if (!gitStatus.hasUpstream && !hasPrimaryRemote) {
      return { label: 'Commit', disabled: false, kind: 'run_action', action: 'commit' }
    }
    if (hasOpenPr || isDefaultRef) {
      return { label: 'Commit & push', disabled: false, kind: 'run_action', action: 'commit_push' }
    }
    return {
      label: `Commit, push & ${terminology.shortLabel}`,
      disabled: false,
      kind: 'run_action',
      action: 'commit_push_pr',
    }
  }

  if (!gitStatus.hasUpstream) {
    if (!hasPrimaryRemote) {
      if (hasOpenPr && !isAhead) {
        return { label: `View ${terminology.shortLabel}`, disabled: false, kind: 'open_pr' }
      }
      return {
        label: 'Publish repository',
        disabled: false,
        kind: 'open_publish',
      }
    }
    if (!isAhead) {
      if (hasOpenPr) {
        return { label: `View ${terminology.shortLabel}`, disabled: false, kind: 'open_pr' }
      }
      return {
        label: 'Push',
        disabled: true,
        kind: 'show_hint',
        hint: 'No local commits to push.',
      }
    }
    if (hasOpenPr || isDefaultRef) {
      return {
        label: 'Push',
        disabled: false,
        kind: 'run_action',
        action: isDefaultRef ? 'commit_push' : 'push',
      }
    }
    return {
      label: `Push & create ${terminology.shortLabel}`,
      disabled: false,
      kind: 'run_action',
      action: 'create_pr',
    }
  }

  if (isDiverged) {
    return {
      label: 'Sync ref',
      disabled: true,
      kind: 'show_hint',
      hint: 'Branch has diverged from upstream. Rebase/merge first.',
    }
  }

  if (isBehind) {
    return {
      label: 'Pull',
      disabled: false,
      kind: 'run_pull',
    }
  }

  if (isAhead) {
    if (hasOpenPr || isDefaultRef) {
      return {
        label: 'Push',
        disabled: false,
        kind: 'run_action',
        action: isDefaultRef ? 'commit_push' : 'push',
      }
    }
    return {
      label: `Push & create ${terminology.shortLabel}`,
      disabled: false,
      kind: 'run_action',
      action: 'create_pr',
    }
  }

  if (canViewPr) {
    return { label: `View ${terminology.shortLabel}`, disabled: false, kind: 'open_pr' }
  }

  if (hasDefaultBranchDelta && !isDefaultRef) {
    return {
      label: `Create ${terminology.shortLabel}`,
      disabled: false,
      kind: 'run_action',
      action: 'create_pr',
    }
  }

  return {
    label: 'Commit',
    disabled: true,
    kind: 'show_hint',
    hint: 'Branch is up to date. No action needed.',
  }
}

/**
 * Whether a stacked action must confirm before running on the default ref.
 * @param action - stacked action about to run.
 * @param isDefaultRef - whether the current ref is the default branch.
 * @returns true when the default-ref dialog must open first.
 */
export function requiresDefaultBranchConfirmation(
  action: GitStackedAction,
  isDefaultRef: boolean,
): boolean {
  if (!isDefaultRef) return false
  return (
    action === 'push'
    || action === 'create_pr'
    || action === 'commit_push'
    || action === 'commit_push_pr'
  )
}

/**
 * Build the default-ref confirmation title, body, and continue label.
 * @param input.action - confirmable stacked action.
 * @param input.branchName - current default ref name.
 * @param input.includesCommit - whether the run will create a commit.
 * @param input.terminology - provider wording; GitHub default when omitted.
 * @returns dialog copy.
 */
export function resolveDefaultBranchActionDialogCopy(input: {
  action: DefaultBranchConfirmableAction
  branchName: string
  includesCommit: boolean
  terminology?: ChangeRequestTerminology
}): DefaultBranchActionDialogCopy {
  const branchLabel = input.branchName
  const suffix = ` on "${branchLabel}". You can continue on this ref or create a feature ref and run the same action there.`
  const terminology = input.terminology ?? DEFAULT_CHANGE_REQUEST_TERMINOLOGY

  if (input.action === 'push' || input.action === 'commit_push') {
    if (input.includesCommit) {
      return {
        title: 'Commit & push to default ref?',
        description: `This action will commit and push changes${suffix}`,
        continueLabel: `Commit & push to ${branchLabel}`,
      }
    }
    return {
      title: 'Push to default ref?',
      description: `This action will push local commits${suffix}`,
      continueLabel: `Push to ${branchLabel}`,
    }
  }

  if (input.includesCommit) {
    return {
      title: `Commit, push & create ${terminology.shortLabel} from default ref?`,
      description: `This action will commit, push, and create a ${terminology.singular}${suffix}`,
      continueLabel: `Commit, push & create ${terminology.shortLabel}`,
    }
  }
  return {
    title: `Push & create ${terminology.shortLabel} from default ref?`,
    description: `This action will push local commits and create a ${terminology.singular}${suffix}`,
    continueLabel: `Push & create ${terminology.shortLabel}`,
  }
}
