// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { BranchMenu, type BranchMenuProps } from '../src/client/BranchMenu.tsx'
import {
  dedupeRemoteBranchesWithLocalMatches,
  deriveLocalBranchNameFromRemoteRef,
  orderBranchRefs,
  resolveAutoFeatureBranchName,
  shouldIncludeBranchPickerItem,
  type BranchRef,
} from '../src/client/branches.ts'
import { en } from '../src/client/locales.ts'

const t: BranchMenuProps['t'] = (key, params) => {
  const template = (en as Record<string, string>)[key] ?? key
  if (!params) return template
  return template.replace(/\{(\w+)\}/g, (match, name: string) => (
    name in params ? String(params[name]) : match
  ))
}

afterEach(cleanup)

describe('branches pure logic (ported from T3code, MIT)', () => {
  it('derives the local name from a remote ref', () => {
    expect(deriveLocalBranchNameFromRemoteRef('origin/feature/demo')).toBe('feature/demo')
    expect(deriveLocalBranchNameFromRemoteRef('noslash')).toBe('noslash')
  })

  it('hides origin refs whose local branch exists, keeps other remotes', () => {
    const refs: BranchRef[] = [
      { name: 'main', isRemote: false, isCurrent: true },
      { name: 'origin/main', isRemote: true, isCurrent: false, remoteName: 'origin' },
      { name: 'origin/other', isRemote: true, isCurrent: false, remoteName: 'origin' },
      { name: 'up/main', isRemote: true, isCurrent: false, remoteName: 'up' },
    ]
    const names = dedupeRemoteBranchesWithLocalMatches(refs).map(ref => ref.name)
    expect(names).toEqual(['main', 'origin/other', 'up/main'])
  })

  it('orders current first, then locals, then remotes', () => {
    const refs: BranchRef[] = [
      { name: 'origin/z', isRemote: true, isCurrent: false, remoteName: 'origin' },
      { name: 'b', isRemote: false, isCurrent: false },
      { name: 'main', isRemote: false, isCurrent: true },
    ]
    expect(orderBranchRefs(refs).map(ref => ref.name)).toEqual(['main', 'b', 'origin/z'])
  })

  it('picks a unique feature/update name', () => {
    expect(resolveAutoFeatureBranchName([])).toBe('feature/update')
    expect(resolveAutoFeatureBranchName(['feature/update'])).toBe('feature/update-2')
    expect(resolveAutoFeatureBranchName(['feature/update', 'feature/update-2'])).toBe('feature/update-3')
    expect(resolveAutoFeatureBranchName(['feature/update', 'feature/update-2'], 'demo')).toBe('feature/demo')
    expect(resolveAutoFeatureBranchName([], 'feature/demo')).toBe('feature/demo')
    expect(resolveAutoFeatureBranchName([], 'foo/bar')).toBe('feature/foo/bar')
    expect(resolveAutoFeatureBranchName([], 'Add README.md')).toBe('feature/add-readme-md')
  })

  it('keeps the create row visible for any query', () => {
    expect(shouldIncludeBranchPickerItem({
      itemValue: '__create__:x',
      normalizedQuery: 'zz',
      createBranchItemValue: '__create__:x',
    })).toBe(true)
    expect(shouldIncludeBranchPickerItem({
      itemValue: 'feature/x',
      normalizedQuery: 'feat',
      createBranchItemValue: null,
    })).toBe(true)
    expect(shouldIncludeBranchPickerItem({
      itemValue: 'main',
      normalizedQuery: 'feat',
      createBranchItemValue: null,
    })).toBe(false)
  })
})

function mountMenu(overrides: Partial<BranchMenuProps> = {}) {
  const gitBranchList = overrides.gitBranchList ?? vi.fn(async () => ({
    ok: true,
    branches: [
      { name: 'main', isRemote: false, isCurrent: true },
      { name: 'feature/qa', isRemote: false, isCurrent: false },
    ] satisfies BranchRef[],
  }))
  const gitSwitchBranch = overrides.gitSwitchBranch ?? vi.fn(async () => ({ ok: true, refName: 'feature/qa' }))
  const gitCreateBranch = overrides.gitCreateBranch ?? vi.fn(async () => ({ ok: true, refName: 'qa-2' }))
  const onChanged = overrides.onChanged ?? vi.fn()
  const onError = overrides.onError ?? vi.fn()
  const props: BranchMenuProps = {
    cwd: 'C:/proj',
    currentRef: 'main',
    t,
    gitBranchList,
    gitSwitchBranch,
    gitCreateBranch,
    onChanged,
    onError,
    ...overrides,
  }
  render(<BranchMenu {...props} />)
  return { gitBranchList, gitSwitchBranch, gitCreateBranch, onChanged, onError }
}

describe('BranchMenu', () => {
  it('shows the current ref on the trigger and loads branches on open', async () => {
    const b = mountMenu()
    expect(screen.getByRole('button', { name: 'Switch branch' }).textContent).toContain('main')
    fireEvent.click(screen.getByRole('button', { name: 'Switch branch' }))
    expect(await screen.findByRole('menuitem', { name: 'feature/qa' })).toBeTruthy()
    expect(await screen.findByRole('menuitem', { name: 'main' })).toBeTruthy()
    expect(b.gitBranchList).toHaveBeenCalledWith('C:/proj')
  })

  it('opens the shared Menu with a filter and branch rows', async () => {
    mountMenu()
    fireEvent.click(screen.getByRole('button', { name: 'Switch branch' }))
    expect(await screen.findByRole('menuitem', { name: 'feature/qa' })).toBeTruthy()
    expect(screen.getByRole('searchbox', { name: 'Search branches…' })).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: 'Create and checkout new branch…' })).toBeTruthy()
  })

  it('filters by query and offers create for unknown names', async () => {
    mountMenu()
    fireEvent.click(screen.getByRole('button', { name: 'Switch branch' }))
    await screen.findByRole('menuitem', { name: 'feature/qa' })
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search branches…' }), { target: { value: 'qa-2' } })
    expect(screen.queryByRole('menuitem', { name: 'feature/qa' })).toBeNull()
    expect(screen.getByRole('menuitem', { name: /Create and checkout branch/ }).textContent).toContain('qa-2')
  })

  it('switches on row click and notifies the parent', async () => {
    const b = mountMenu()
    fireEvent.click(screen.getByRole('button', { name: 'Switch branch' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'feature/qa' }))
    await waitFor(() => { expect(b.gitSwitchBranch).toHaveBeenCalledWith('C:/proj', 'feature/qa') })
    await waitFor(() => { expect(b.onChanged).toHaveBeenCalled() })
  })

  it('opens the create dialog from the footer and creates the named branch', async () => {
    const b = mountMenu()
    fireEvent.click(screen.getByRole('button', { name: 'Switch branch' }))
    await screen.findByRole('menuitem', { name: 'feature/qa' })
    fireEvent.click(screen.getByRole('menuitem', { name: 'Create and checkout new branch…' }))
    expect(await screen.findByRole('dialog', { name: 'Create and checkout new branch' })).toBeTruthy()
    fireEvent.change(screen.getByRole('textbox', { name: 'Branch name' }), {
      target: { value: 'qa-2' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Create and switch' }))
    await waitFor(() => { expect(b.gitCreateBranch).toHaveBeenCalledWith('C:/proj', 'qa-2') })
  })

  it('prefills the create dialog from the typed query', async () => {
    const b = mountMenu()
    fireEvent.click(screen.getByRole('button', { name: 'Switch branch' }))
    await screen.findByRole('menuitem', { name: 'feature/qa' })
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search branches…' }), { target: { value: 'qa-2' } })
    fireEvent.click(screen.getByRole('menuitem', { name: /Create and checkout branch/ }))
    expect(await screen.findByRole('dialog', { name: 'Create and checkout new branch' })).toBeTruthy()
    expect(screen.getByRole<HTMLInputElement>('textbox', { name: 'Branch name' }).value).toBe('qa-2')
    fireEvent.click(screen.getByRole('button', { name: 'Create and switch' }))
    await waitFor(() => { expect(b.gitCreateBranch).toHaveBeenCalledWith('C:/proj', 'qa-2') })
  })

  it('reports switch failure on the parent error toast', async () => {
    const b = mountMenu({
      gitSwitchBranch: vi.fn(async () => ({ ok: false, message: 'checkout failed' })),
    })
    fireEvent.click(screen.getByRole('button', { name: 'Switch branch' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'feature/qa' }))
    await waitFor(() => {
      expect(b.onError).toHaveBeenCalledWith('checkout failed', 'Failed to switch branch.')
    })
    expect(screen.queryByRole('dialog', { name: 'Action failed' })).toBeNull()
    expect(b.gitSwitchBranch).toHaveBeenCalled()
  })

  it('disables the trigger while a stacked Git action holds the titlebar', () => {
    mountMenu({ disabled: true })
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Switch branch' }).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Switch branch' }))
    expect(screen.queryByRole('menuitem')).toBeNull()
  })
})
