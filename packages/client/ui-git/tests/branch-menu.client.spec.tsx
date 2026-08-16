// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { BranchMenu, type BranchMenuProps } from '../src/client/BranchMenu.tsx'
import {
  dedupeRemoteBranchesWithLocalMatches,
  deriveLocalBranchNameFromRemoteRef,
  orderBranchRefs,
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
  const props: BranchMenuProps = {
    cwd: 'C:/proj',
    currentRef: 'main',
    t,
    gitBranchList,
    gitSwitchBranch,
    gitCreateBranch,
    onChanged,
    ...overrides,
  }
  render(<BranchMenu {...props} />)
  return { gitBranchList, gitSwitchBranch, gitCreateBranch, onChanged }
}

describe('BranchMenu', () => {
  it('shows the current ref on the trigger and loads branches on open', async () => {
    const b = mountMenu()
    expect(screen.getByRole('button', { name: 'Switch branch' }).textContent).toContain('main')
    fireEvent.click(screen.getByRole('button', { name: 'Switch branch' }))
    expect(await screen.findByText('feature/qa')).toBeTruthy()
    expect(await screen.findByText('current')).toBeTruthy()
    expect(b.gitBranchList).toHaveBeenCalledWith('C:/proj')
  })

  it('filters by query and offers create for unknown names', async () => {
    mountMenu()
    fireEvent.click(screen.getByRole('button', { name: 'Switch branch' }))
    await screen.findByText('feature/qa')
    fireEvent.change(screen.getByPlaceholderText('Search branches…'), { target: { value: 'qa-2' } })
    expect(screen.queryByText('feature/qa')).toBeNull()
    expect(screen.getByText(/Create and checkout/).textContent).toContain('qa-2')
  })

  it('switches on row click and notifies the parent', async () => {
    const b = mountMenu()
    fireEvent.click(screen.getByRole('button', { name: 'Switch branch' }))
    fireEvent.click(await screen.findByText('feature/qa'))
    await waitFor(() => { expect(b.gitSwitchBranch).toHaveBeenCalledWith('C:/proj', 'feature/qa') })
    await waitFor(() => { expect(b.onChanged).toHaveBeenCalled() })
  })

  it('creates the typed branch from the create row', async () => {
    const b = mountMenu()
    fireEvent.click(screen.getByRole('button', { name: 'Switch branch' }))
    await screen.findByText('feature/qa')
    fireEvent.change(screen.getByPlaceholderText('Search branches…'), { target: { value: 'qa-2' } })
    fireEvent.click(screen.getByText(/Create and checkout/))
    await waitFor(() => { expect(b.gitCreateBranch).toHaveBeenCalledWith('C:/proj', 'qa-2') })
  })

  it('always shows the create entry; the hint focuses the search box', async () => {
    const b = mountMenu()
    fireEvent.click(screen.getByRole('button', { name: 'Switch branch' }))
    await screen.findByText('feature/qa')
    // Hint variant before a name is typed; clicking it focuses the input.
    const hint = screen.getByRole('button', { name: 'Create and checkout new branch…' })
    expect(hint.textContent).not.toContain('qa')
    fireEvent.click(hint)
    const input = screen.getByPlaceholderText('Search branches…')
    expect(document.activeElement).toBe(input)
    // An existing local name keeps the hint variant instead of offering create.
    fireEvent.change(input, { target: { value: 'main' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create and checkout new branch…' }))
    expect(b.gitCreateBranch).not.toHaveBeenCalled()
  })

  it('keeps the panel open with an alert when the switch fails', async () => {
    const b = mountMenu({
      gitSwitchBranch: vi.fn(async () => ({ ok: false, message: 'checkout failed' })),
    })
    fireEvent.click(screen.getByRole('button', { name: 'Switch branch' }))
    fireEvent.click(await screen.findByText('feature/qa'))
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('checkout failed')
    // The panel stays open so the failure is visible.
    expect(screen.getByPlaceholderText('Search branches…')).toBeTruthy()
    expect(b.gitSwitchBranch).toHaveBeenCalled()
  })
})
