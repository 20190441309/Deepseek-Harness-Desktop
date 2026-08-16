import type { TreeEntry } from './FileTree.tsx'

/** Max directory depth walked for a name search (root = 0). */
export const MAX_SEARCH_DEPTH = 8

/** Max directories listed during one search walk. */
export const MAX_SEARCH_DIRS = 200

/**
 * Keep directories that contain a match and files whose name matches `query`.
 * @param entries - one directory's children.
 * @param query - case-insensitive name fragment; empty keeps every entry.
 * @param childrenByPath - already-loaded directory children.
 * @returns the visible subset, preserving order.
 */
export function filterEntries(
  entries: readonly TreeEntry[],
  query: string,
  childrenByPath: Readonly<Record<string, readonly TreeEntry[]>>,
): TreeEntry[] {
  const needle = query.trim().toLowerCase()
  if (needle === '') return [...entries]
  return entries.filter((entry) => {
    if (entry.name.toLowerCase().includes(needle)) return true
    if (entry.kind !== 'directory') return false
    return filterEntries(childrenByPath[entry.path] ?? [], query, childrenByPath).length > 0
  })
}

/** Mutable budget for one recursive search walk. */
export interface SearchWalkBudget {
  dirsRemaining: number
}

/**
 * Decide whether a search walk may list another directory.
 * @param budget - remaining directory listings for this query.
 * @param depth - depth of the directory about to be listed (root = 0).
 * @returns true when the walk may call `listDir` for that directory.
 */
export function mayListSearchDir(budget: SearchWalkBudget, depth: number): boolean {
  if (depth > MAX_SEARCH_DEPTH) return false
  if (budget.dirsRemaining <= 0) return false
  budget.dirsRemaining -= 1
  return true
}
