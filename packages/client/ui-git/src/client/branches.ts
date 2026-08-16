/**
 * Branch picker pure logic. `deriveLocalBranchNameFromRemoteRef`,
 * `dedupeRemoteBranchesWithLocalMatches`, and `shouldIncludeBranchPickerItem`
 * are adapted from T3 Tools Inc.'s T3code (MIT) BranchToolbar logic; behavior
 * is preserved, Effect/t3 imports are rewritten as plain TypeScript.
 * @module @deepseek-ai/dsh-client-ui-git/client/branches
 */

/** One ref row the picker lists. */
export interface BranchRef {
  /** Short display name, e.g. `main` or `origin/main`. */
  name: string
  /** True for refs/remotes/* rows. */
  isRemote: boolean
  /** True on the checked-out branch. */
  isCurrent: boolean
  /** Remote name for remote rows (`origin`); absent for local rows. */
  remoteName?: string
  /** True on the origin/HEAD target when known. */
  isDefault?: boolean
}

/**
 * Strip the remote prefix from a remote ref such as `origin/feature/demo`.
 * @param branchName - ref short name.
 * @returns the local branch name the ref would check out as.
 */
export function deriveLocalBranchNameFromRemoteRef(branchName: string): string {
  const firstSeparatorIndex = branchName.indexOf('/')
  if (firstSeparatorIndex <= 0 || firstSeparatorIndex === branchName.length - 1) {
    return branchName
  }
  return branchName.slice(firstSeparatorIndex + 1)
}

function localNameCandidates(branchName: string, remoteName?: string): string[] {
  const candidates = new Set<string>()
  const firstSlash = deriveLocalBranchNameFromRemoteRef(branchName)
  if (firstSlash.length > 0) candidates.add(firstSlash)
  if (remoteName !== undefined) {
    const prefix = `${remoteName}/`
    if (branchName.startsWith(prefix) && branchName.length > prefix.length) {
      candidates.add(branchName.slice(prefix.length))
    }
  }
  return [...candidates]
}

/**
 * Hide `origin/*` remote refs when a matching local ref already exists.
 * @param refs - full ref list from gitBranchList.
 * @returns refs with redundant origin rows removed.
 */
export function dedupeRemoteBranchesWithLocalMatches(refs: readonly BranchRef[]): BranchRef[] {
  const localNames = new Set(refs.filter(ref => !ref.isRemote).map(ref => ref.name))
  return refs.filter((ref) => {
    if (!ref.isRemote) return true
    if (ref.remoteName !== 'origin') return true
    return !localNameCandidates(ref.name, ref.remoteName).some(candidate => localNames.has(candidate))
  })
}

/**
 * Whether a picker row survives the current query; the synthetic create row
 * always survives so the "create branch" affordance stays reachable.
 * @param input - row value, normalized query, and synthetic row ids.
 * @returns whether the row is visible.
 */
export function shouldIncludeBranchPickerItem(input: {
  itemValue: string
  normalizedQuery: string
  createBranchItemValue: string | null
}): boolean {
  const { itemValue, normalizedQuery, createBranchItemValue } = input
  if (normalizedQuery.length === 0) return true
  if (createBranchItemValue !== null && itemValue === createBranchItemValue) return true
  return itemValue.toLowerCase().includes(normalizedQuery)
}

/**
 * Order the picker rows the way the titlebar shows them: current first, then
 * locals alphabetically, then remotes alphabetically.
 * @param refs - deduped ref list.
 * @returns ordered rows.
 */
export function orderBranchRefs(refs: readonly BranchRef[]): BranchRef[] {
  const weight = (ref: BranchRef): number => (ref.isCurrent ? 0 : ref.isRemote ? 2 : 1)
  return [...refs].sort((a, b) => weight(a) - weight(b) || a.name.localeCompare(b.name))
}
