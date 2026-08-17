/** `preview` namespace dictionaries: local URL bar and desktop-only empty copy. */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'title': '浏览器',
  'placeholder': '搜索或输入 URL',
  'unavailable': '浏览器预览仅在桌面应用中可用。',
  'empty': '输入本地应用或 URL。',
  'rejected': '只能预览本机地址。',
  'navigation': '导航',
  'back': '后退',
  'forward': '前进',
  'reload': '刷新',
  'external': '在系统浏览器打开',
  'devtools': '开发者工具',
  'more': '更多',
  'discovered': '发现的本地服务',
} satisfies Record<string, string>

/** The preview namespace key union. */
export type PreviewKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'title': 'Browser',
  'placeholder': 'Search or enter URL',
  'unavailable': 'Browser previews are only available in the desktop app.',
  'empty': 'Open a local app or URL.',
  'rejected': 'Preview only opens local URLs.',
  'navigation': 'Navigation',
  'back': 'Back',
  'forward': 'Forward',
  'reload': 'Reload',
  'external': 'Open in system browser',
  'devtools': 'Developer tools',
  'more': 'More',
  'discovered': 'Discovered local servers',
} satisfies Record<PreviewKey, string>

/** Dictionary namespace owned by this plugin. */
export const NS = 'preview'
