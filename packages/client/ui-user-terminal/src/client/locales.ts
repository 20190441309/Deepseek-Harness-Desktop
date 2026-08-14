/** `terminal` namespace dictionaries: drawer and surface chrome. */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'empty.title': '暂无终端会话',
  'empty.unavailable': '没有工作区，无法启动终端',
  'action.split': '分屏',
  'action.split.limit': '分屏（每组最多 4 个）',
  'action.maximize': '最大化',
  'action.restore': '还原',
  'action.new': '新建终端',
  'action.close': '关闭终端',
  'resize': '调整终端高度',
  'session.label': '终端',
  'error.create': '无法启动终端',
} satisfies Record<string, string>

/** The terminal namespace key union. */
export type TerminalKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'empty.title': 'No terminal sessions yet',
  'empty.unavailable': 'A workspace is required to start a terminal',
  'action.split': 'Split',
  'action.split.limit': 'Split (max 4 per group)',
  'action.maximize': 'Maximize',
  'action.restore': 'Restore',
  'action.new': 'New terminal',
  'action.close': 'Close terminal',
  'resize': 'Resize terminal drawer',
  'session.label': 'Terminal',
  'error.create': 'Could not start a terminal',
} satisfies Record<TerminalKey, string>

/** Dictionary namespace owned by this plugin. */
export const NS = 'terminal'
