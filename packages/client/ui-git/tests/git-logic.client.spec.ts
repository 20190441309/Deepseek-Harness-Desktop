/** Key T3code GitActionsControl.logic vectors against this package's VcsStatus JSON. */
import { describe, expect, it } from 'vitest'
import type { VcsStatus } from '../src/client/git-logic.ts'
import {
  buildMenuItems,
  requiresDefaultBranchConfirmation,
  resolveDefaultBranchActionDialogCopy,
  resolveQuickAction,
} from '../src/client/git-logic.ts'

function status(overrides: Partial<VcsStatus> = {}): VcsStatus {
  return {
    refName: 'feature/test',
    hasWorkingTreeChanges: false,
    hasUpstream: true,
    aheadCount: 0,
    behindCount: 0,
    pr: null,
    ...overrides,
  }
}

describe('when: working tree has local changes on the default ref', () => {
  it('resolveQuickAction returns Commit & push', () => {
    const quick = resolveQuickAction(
      status({ refName: 'main', hasWorkingTreeChanges: true }),
      false,
      true,
    )
    expect(quick).toMatchObject({
      kind: 'run_action',
      action: 'commit_push',
      label: 'Commit & push',
      disabled: false,
    })
  })
})

describe('when: ref is clean, ahead, and on the default ref', () => {
  it('resolveQuickAction returns Push', () => {
    const quick = resolveQuickAction(
      status({ refName: 'main', aheadCount: 2, pr: null }),
      false,
      true,
    )
    expect(quick).toMatchObject({
      kind: 'run_action',
      action: 'commit_push',
      label: 'Push',
      disabled: false,
    })
  })
})

describe('when: git status is unavailable', () => {
  it('resolveQuickAction returns unavailable disabled state', () => {
    const quick = resolveQuickAction(null, false)
    expect(quick).toMatchObject({
      kind: 'show_hint',
      label: 'Commit',
      disabled: true,
      hint: 'Git status is unavailable.',
    })
  })

  it('buildMenuItems returns no menu items', () => {
    expect(buildMenuItems(null, false)).toEqual([])
  })
})

describe('when: ref is clean, ahead, and has no open PR', () => {
  it('resolveQuickAction pushes and creates a PR', () => {
    const quick = resolveQuickAction(status({ aheadCount: 2, pr: null }), false)
    expect(quick).toMatchObject({
      kind: 'run_action',
      action: 'create_pr',
      label: 'Push & create PR',
    })
  })

  it('buildMenuItems enables push and create PR, with commit disabled', () => {
    expect(buildMenuItems(status({ aheadCount: 2, pr: null }), false)).toEqual([
      {
        id: 'commit',
        label: 'Commit',
        disabled: true,
        icon: 'commit',
        kind: 'open_dialog',
        dialogAction: 'commit',
      },
      {
        id: 'push',
        label: 'Push',
        disabled: false,
        icon: 'push',
        kind: 'open_dialog',
        dialogAction: 'push',
      },
      {
        id: 'pr',
        label: 'Create PR',
        disabled: false,
        icon: 'pr',
        kind: 'open_dialog',
        dialogAction: 'create_pr',
      },
    ])
  })
})

describe('when: source control provider uses merge requests', () => {
  it('uses GitLab MR terminology in quick actions and menu items', () => {
    const gitlabStatus = status({
      aheadCount: 2,
      sourceControlProvider: {
        kind: 'gitlab',
        name: 'GitLab',
        baseUrl: 'https://gitlab.com',
      },
    })
    expect(resolveQuickAction(gitlabStatus, false)).toMatchObject({
      kind: 'run_action',
      action: 'create_pr',
      label: 'Push & create MR',
    })
    expect(buildMenuItems(gitlabStatus, false)[2]).toMatchObject({
      id: 'pr',
      label: 'Create MR',
    })
  })
})

describe('when: actions are busy', () => {
  it('resolveQuickAction returns running disabled state', () => {
    expect(resolveQuickAction(status(), true)).toMatchObject({
      kind: 'show_hint',
      label: 'Commit',
      disabled: true,
      hint: 'Git action in progress.',
    })
  })
})

describe('when: working tree has local changes on a feature ref', () => {
  it('resolveQuickAction returns commit, push, and create PR', () => {
    expect(resolveQuickAction(status({ hasWorkingTreeChanges: true }), false)).toMatchObject({
      kind: 'run_action',
      action: 'commit_push_pr',
      label: 'Commit, push & PR',
    })
  })

  it('buildMenuItems enables commit and disables push and PR', () => {
    const items = buildMenuItems(status({ hasWorkingTreeChanges: true }), false)
    expect(items.find(item => item.id === 'commit')?.disabled).toBe(false)
    expect(items.find(item => item.id === 'push')?.disabled).toBe(true)
    expect(items.find(item => item.id === 'pr')?.disabled).toBe(true)
  })
})

describe('requiresDefaultBranchConfirmation', () => {
  it('requires confirmation for push actions on default ref', () => {
    expect(requiresDefaultBranchConfirmation('commit', true)).toBe(false)
    expect(requiresDefaultBranchConfirmation('push', true)).toBe(true)
    expect(requiresDefaultBranchConfirmation('create_pr', true)).toBe(true)
    expect(requiresDefaultBranchConfirmation('commit_push', true)).toBe(true)
    expect(requiresDefaultBranchConfirmation('commit_push_pr', true)).toBe(true)
    expect(requiresDefaultBranchConfirmation('commit_push', false)).toBe(false)
    expect(requiresDefaultBranchConfirmation('push', false)).toBe(false)
  })
})

describe('resolveDefaultBranchActionDialogCopy', () => {
  it('uses push-only copy when pushing without a commit', () => {
    expect(resolveDefaultBranchActionDialogCopy({
      action: 'commit_push',
      branchName: 'main',
      includesCommit: false,
    })).toEqual({
      title: 'Push to default ref?',
      description:
        'This action will push local commits on "main". You can continue on this ref or create a feature ref and run the same action there.',
      continueLabel: 'Push to main',
    })
  })

  it('keeps commit copy when the action includes a commit', () => {
    expect(resolveDefaultBranchActionDialogCopy({
      action: 'commit_push',
      branchName: 'main',
      includesCommit: true,
    })).toEqual({
      title: 'Commit & push to default ref?',
      description:
        'This action will commit and push changes on "main". You can continue on this ref or create a feature ref and run the same action there.',
      continueLabel: 'Commit & push to main',
    })
  })
})
