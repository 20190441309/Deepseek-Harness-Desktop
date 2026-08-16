/** `agents` namespace dictionaries: current-session subagent list. */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'title': '代理',
  'empty.title': '还没有子代理',
  'empty.body': '当前会话生成子代理后，会显示在这里。',
  'activity.running': '正在运行',
  'activity.inactive': '当前未运行',
  'mode.oneShot': '一次性',
  'mode.continuable': '可继续',
  'list.aria': '当前会话的子代理',
  'jobs.title': '后台任务',
  'jobs.aria': '当前会话的后台任务',
} satisfies Record<string, string>

/** The agents namespace key union. */
export type AgentsKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'title': 'Agents',
  'empty.title': 'No agents yet',
  'empty.body': 'When this session spawns subagents, they show up here.',
  'activity.running': 'running',
  'activity.inactive': 'not running',
  'mode.oneShot': 'one-shot',
  'mode.continuable': 'continuable',
  'list.aria': 'Subagents in this session',
  'jobs.title': 'Background jobs',
  'jobs.aria': 'Background jobs in this session',
} satisfies Record<AgentsKey, string>

/** Dictionary namespace owned by this plugin. */
export const NS = 'agents'
