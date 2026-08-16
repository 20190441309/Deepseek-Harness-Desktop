import { useState, type MouseEvent, type ReactNode } from 'react'
import clsx from 'clsx'
import {
  IconChevronRightOutline14,
  IconCodeOutline16,
  IconFolderClose16,
  IconFolderOpen16,
  Menu,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { MenuEntry } from '@deepseek-ai/dsh-client-ui-primitives'
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
  onMention?: ((path: string) => void) | undefined
  onCopyRelative?: ((path: string) => void) | undefined
  onCopyAbsolute?: ((path: string) => void) | undefined
  mentionLabel?: string | undefined
  copyRelativeLabel?: string | undefined
  copyAbsoluteLabel?: string | undefined
  /** False for nested directory lists so they keep indent. */
  root?: boolean | undefined
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
  onMention,
  onCopyRelative,
  onCopyAbsolute,
  mentionLabel,
  copyRelativeLabel,
  copyAbsoluteLabel,
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
          onMention={onMention}
          onCopyRelative={onCopyRelative}
          onCopyAbsolute={onCopyAbsolute}
          mentionLabel={mentionLabel}
          copyRelativeLabel={copyRelativeLabel}
          copyAbsoluteLabel={copyAbsoluteLabel}
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
  onMention,
  onCopyRelative,
  onCopyAbsolute,
  mentionLabel,
  copyRelativeLabel,
  copyAbsoluteLabel,
}: {
  entry: TreeEntry
  childrenByPath: FileTreeProps['childrenByPath']
  expanded: ReadonlySet<string>
  onToggle: (path: string) => void
  onOpenFile: (path: string) => void
  onMention: FileTreeProps['onMention']
  onCopyRelative: FileTreeProps['onCopyRelative']
  onCopyAbsolute: FileTreeProps['onCopyAbsolute']
  mentionLabel: FileTreeProps['mentionLabel']
  copyRelativeLabel: FileTreeProps['copyRelativeLabel']
  copyAbsoluteLabel: FileTreeProps['copyAbsoluteLabel']
}): ReactNode {
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const items: MenuEntry[] = []
  if (onCopyRelative !== undefined && copyRelativeLabel !== undefined) {
    items.push({ id: 'relative', label: copyRelativeLabel })
  }
  if (onCopyAbsolute !== undefined && copyAbsoluteLabel !== undefined) {
    items.push({ id: 'absolute', label: copyAbsoluteLabel })
  }

  const onContext = (event: MouseEvent) => {
    if (items.length === 0) return
    event.preventDefault()
    setMenu({ x: event.clientX, y: event.clientY })
  }

  const row = (
    <button
      type="button"
      className={css.row}
      aria-expanded={entry.kind === 'directory' ? expanded.has(entry.path) : undefined}
      onClick={() => {
        if (entry.kind === 'file') onOpenFile(entry.path)
        else onToggle(entry.path)
      }}
      onContextMenu={onContext}
    >
      {entry.kind === 'directory' ? (
        <IconChevronRightOutline14
          size={12}
          className={clsx(css.twist, expanded.has(entry.path) && css.twistOpen)}
        />
      ) : (
        <span className={css.twist} aria-hidden="true" />
      )}
      {entry.kind === 'directory'
        ? (expanded.has(entry.path)
          ? <IconFolderOpen16 size={14} className={css.icon} />
          : <IconFolderClose16 size={14} className={css.icon} />)
        : <IconCodeOutline16 size={14} className={css.icon} />}
      <span className={css.name}>{entry.name}</span>
    </button>
  )

  const mention = entry.kind === 'file' && onMention !== undefined && mentionLabel !== undefined ? (
    <button
      type="button"
      className={css.mention}
      aria-label={mentionLabel}
      onClick={(event) => {
        event.stopPropagation()
        onMention(entry.path)
      }}
    >
      @
    </button>
  ) : null

  const menuNode = menu !== null && items.length > 0 ? (
    <Menu
      open
      portal
      compact
      getAnchorRect={() => new DOMRect(menu.x, menu.y, 0, 0)}
      items={items}
      onSelect={(id) => {
        setMenu(null)
        if (id === 'relative') {
          onCopyRelative?.(entry.path)
          return
        }
        /* v8 ignore next -- Menu only emits the declared item ids. */
        if (id !== 'absolute') return
        onCopyAbsolute?.(entry.path)
      }}
      onClose={() => { setMenu(null) }}
      anchor={<span className={css.contextAnchor} />}
    />
  ) : null

  if (entry.kind === 'file') {
    return (
      <li className={css.item}>
        {row}
        {mention}
        {menuNode}
      </li>
    )
  }
  const open = expanded.has(entry.path)
  const children = childrenByPath[entry.path] ?? []
  return (
    <li className={css.item}>
      {row}
      {menuNode}
      {open ? (
        <FileTree
          entries={children}
          childrenByPath={childrenByPath}
          expanded={expanded}
          onToggle={onToggle}
          onOpenFile={onOpenFile}
          onMention={onMention}
          onCopyRelative={onCopyRelative}
          onCopyAbsolute={onCopyAbsolute}
          mentionLabel={mentionLabel}
          copyRelativeLabel={copyRelativeLabel}
          copyAbsoluteLabel={copyAbsoluteLabel}
          root={false}
        />
      ) : null}
    </li>
  )
}
