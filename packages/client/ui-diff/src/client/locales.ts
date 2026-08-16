/** `diff` namespace dictionaries: workspace change list and hunks. */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'title': '工作区变更',
  'empty.cwd': '没有工作区，无法查看差异。',
  'empty.changes': '没有净变更。',
  'unavailable': '差异仅适用于 Git 仓库中的服务端会话。',
  'error.load': '无法加载差异。',
  'truncated': '差异过长，仅显示开头。',
  'refresh': '刷新',
  'group.staged': '已暂存',
  'group.unstaged': '未暂存',
  'stage': '暂存',
  'unstage': '取消暂存',
  'discard': '还原',
  'discard.title': '还原工作区更改？',
  'discard.body': '未暂存的更改将被丢弃，无法恢复。',
  'discard.confirm': '还原',
  'discard.cancel': '取消',
} satisfies Record<string, string>

/** The diff namespace key union. */
export type DiffKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'title': 'Working tree',
  'empty.cwd': 'A workspace is required to review diffs.',
  'empty.changes': 'No net changes in this selection.',
  'unavailable': 'Diff is only available for server threads in Git repositories.',
  'error.load': 'Could not load the diff.',
  'truncated': 'Diff is too large; showing the beginning.',
  'refresh': 'Refresh',
  'group.staged': 'Staged',
  'group.unstaged': 'Unstaged',
  'stage': 'Stage',
  'unstage': 'Unstage',
  'discard': 'Discard',
  'discard.title': 'Discard working-tree changes?',
  'discard.body': 'Unstaged changes will be lost and cannot be undone.',
  'discard.confirm': 'Discard',
  'discard.cancel': 'Cancel',
} satisfies Record<DiffKey, string>

/** Dictionary namespace owned by this plugin. */
export const NS = 'diff'
