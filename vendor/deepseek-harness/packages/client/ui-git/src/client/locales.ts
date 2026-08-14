/** `git` namespace dictionaries: commit dialog chrome and the options trigger. */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'menu.options': 'Git 操作',
  'commit.title': '提交更改',
  'commit.description': '确认提交说明。留空则使用默认说明。',
  'commit.message': '提交说明',
  'commit.placeholder': '留空则使用默认说明',
  'commit.submit': '提交',
  'commit.cancel': '取消',
  'confirm.abort': '取消',
  'publish.unavailable': '发布仓库不可用。',
} satisfies Record<string, string>

/** The git namespace key union. */
export type GitKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'menu.options': 'Git actions',
  'commit.title': 'Commit changes',
  'commit.description': 'Review and confirm your commit. Leave the message blank to use a default.',
  'commit.message': 'Commit message',
  'commit.placeholder': 'Leave empty to use a default',
  'commit.submit': 'Commit',
  'commit.cancel': 'Cancel',
  'confirm.abort': 'Abort',
  'publish.unavailable': 'Publish repository is unavailable.',
} satisfies Record<GitKey, string>

/** Dictionary namespace owned by this plugin. */
export const NS = 'git'
