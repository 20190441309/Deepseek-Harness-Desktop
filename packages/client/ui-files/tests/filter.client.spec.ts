import { describe, expect, it } from 'vitest'
import {
  filterEntries,
  mayListSearchDir,
  MAX_SEARCH_DEPTH,
  MAX_SEARCH_DIRS,
} from '../src/client/filter.ts'

describe('filterEntries', () => {
  it('keeps matching files and ancestor directories', () => {
    const children = {
      src: [
        { name: 'a.ts', kind: 'file' as const, path: 'src/a.ts' },
        { name: 'b.md', kind: 'file' as const, path: 'src/b.md' },
      ],
    }
    const root = [
      { name: 'src', kind: 'directory' as const, path: 'src' },
      { name: 'README.md', kind: 'file' as const, path: 'README.md' },
    ]
    expect(filterEntries(root, 'a.ts', children).map(e => e.path)).toEqual(['src'])
    expect(filterEntries(root, 'README', children).map(e => e.path)).toEqual(['README.md'])
    expect(filterEntries(root, '', children)).toEqual(root)
  })
})

describe('mayListSearchDir', () => {
  it('stops after the depth and directory budgets', () => {
    const budget = { dirsRemaining: 2 }
    expect(mayListSearchDir(budget, 0)).toBe(true)
    expect(mayListSearchDir(budget, 1)).toBe(true)
    expect(mayListSearchDir(budget, 2)).toBe(false)
    expect(budget.dirsRemaining).toBe(0)
    expect(mayListSearchDir({ dirsRemaining: 10 }, MAX_SEARCH_DEPTH + 1)).toBe(false)
    expect(MAX_SEARCH_DIRS).toBeGreaterThan(0)
  })
})
