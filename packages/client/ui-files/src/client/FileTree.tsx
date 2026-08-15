import type { ReactNode } from 'react'
import clsx from 'clsx'
import {
  IconChevronRightOutline14,
  IconCodeOutline16,
  IconFolderClose16,
  IconFolderOpen16,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { DirEntry } from './shell.ts'
import css from './FileTree.module.css'

/** A workspace entry with its path relative to session cwd. */
export interface TreeEntry extends DirEntry {
  path: string
}

export interface FileTreeProps {
  entries: readonly TreeEntry[]
  childrenByPath: Readonly<Record<string, readonly TreeEntry[]>>
  expanded: ReadonlySet<string>
  onToggle: (path: string) => void
  onOpenFile: (path: string) => void
  /** False for nested directory lists so they keep indent. */
  root?: boolean
}

/**
 * Join a parent relative path and a child name with `/`.
 * @param parent - parent relative path, or empty for the workspace root.
 * @param name - entry name.
 * @returns the child relative path.
 */
export function joinRel(parent: string, name: string): string {
  return parent === '' ? name : `${parent}/${name}`
}

/**
 * Read-only workspace tree. Directories expand in place; files call onOpenFile.
 * @param props - entries, expanded dirs, and callbacks.
 * @returns the tree.
 */
export function FileTree({
  entries,
  childrenByPath,
  expanded,
  onToggle,
  onOpenFile,
  root = true,
}: FileTreeProps): ReactNode {
  return (
    <ul className={css.list} {...(root ? { 'data-file-tree': true } : {})}>
      {entries.map(entry => (
        <TreeNode
          key={entry.path}
          entry={entry}
          childrenByPath={childrenByPath}
          expanded={expanded}
          onToggle={onToggle}
          onOpenFile={onOpenFile}
        />
      ))}
    </ul>
  )
}

function TreeNode({
  entry,
  childrenByPath,
  expanded,
  onToggle,
  onOpenFile,
}: {
  entry: TreeEntry
  childrenByPath: FileTreeProps['childrenByPath']
  expanded: ReadonlySet<string>
  onToggle: (path: string) => void
  onOpenFile: (path: string) => void
}): ReactNode {
  if (entry.kind === 'file') {
    return (
      <li>
        <button
          type="button"
          className={css.row}
          onClick={() => { onOpenFile(entry.path) }}
        >
          <span className={css.twist} aria-hidden="true" />
          <IconCodeOutline16 size={14} className={css.icon} />
          <span className={css.name}>{entry.name}</span>
        </button>
      </li>
    )
  }
  const open = expanded.has(entry.path)
  const children = childrenByPath[entry.path] ?? []
  return (
    <li>
      <button
        type="button"
        className={css.row}
        aria-expanded={open}
        onClick={() => { onToggle(entry.path) }}
      >
        <IconChevronRightOutline14
          size={12}
          className={clsx(css.twist, open && css.twistOpen)}
        />
        {open
          ? <IconFolderOpen16 size={14} className={css.icon} />
          : <IconFolderClose16 size={14} className={css.icon} />}
        <span className={css.name}>{entry.name}</span>
      </button>
      {open ? (
        <FileTree
          entries={children}
          childrenByPath={childrenByPath}
          expanded={expanded}
          onToggle={onToggle}
          onOpenFile={onOpenFile}
          root={false}
        />
      ) : null}
    </li>
  )
}
