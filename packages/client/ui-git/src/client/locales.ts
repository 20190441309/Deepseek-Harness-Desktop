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
  'confirm.push.title': '推送到默认分支？',
  'confirm.push.description': '此操作会将本地提交推送到“{branch}”。你可以继续在此引用上操作，或新建功能引用后再执行同一操作。',
  'confirm.push.continue': '推送到 {branch}',
  'confirm.commitPush.title': '提交并推送到默认分支？',
  'confirm.commitPush.description': '此操作会提交更改并推送到“{branch}”。你可以继续在此引用上操作，或新建功能引用后再执行同一操作。',
  'confirm.commitPush.continue': '提交并推送到 {branch}',
  'confirm.pr.title': '从默认分支推送并创建变更请求？',
  'confirm.pr.description': '此操作会推送本地提交并从“{branch}”创建变更请求。你可以继续在此引用上操作，或新建功能引用后再执行同一操作。',
  'confirm.pr.continue': '推送并创建变更请求',
  'confirm.commitPr.title': '从默认分支提交、推送并创建变更请求？',
  'confirm.commitPr.description': '此操作会提交、推送并从“{branch}”创建变更请求。你可以继续在此引用上操作，或新建功能引用后再执行同一操作。',
  'confirm.commitPr.continue': '提交、推送并创建变更请求',
  'hint.unavailable': 'Git 状态不可用。',
  'hint.busy': 'Git 操作进行中。',
  'publish.unavailable': '发布仓库不可用。',
  'error.title': '操作失败',
  'error.close': '关闭',
  'error.fallback': 'Git 操作失败。',
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
  'confirm.push.title': 'Push to default ref?',
  'confirm.push.description': 'This action will push local commits on "{branch}". You can continue on this ref or create a feature ref and run the same action there.',
  'confirm.push.continue': 'Push to {branch}',
  'confirm.commitPush.title': 'Commit & push to default ref?',
  'confirm.commitPush.description': 'This action will commit and push changes on "{branch}". You can continue on this ref or create a feature ref and run the same action there.',
  'confirm.commitPush.continue': 'Commit & push to {branch}',
  'confirm.pr.title': 'Push & create change request from default ref?',
  'confirm.pr.description': 'This action will push local commits and create a change request on "{branch}". You can continue on this ref or create a feature ref and run the same action there.',
  'confirm.pr.continue': 'Push & create change request',
  'confirm.commitPr.title': 'Commit, push & create change request from default ref?',
  'confirm.commitPr.description': 'This action will commit, push, and create a change request on "{branch}". You can continue on this ref or create a feature ref and run the same action there.',
  'confirm.commitPr.continue': 'Commit, push & create change request',
  'hint.unavailable': 'Git status is unavailable.',
  'hint.busy': 'Git action in progress.',
  'publish.unavailable': 'Publish repository is unavailable.',
  'error.title': 'Action failed',
  'error.close': 'Close',
  'error.fallback': 'Git action failed.',
} satisfies Record<GitKey, string>

/** Dictionary namespace owned by this plugin. */
export const NS = 'git'
