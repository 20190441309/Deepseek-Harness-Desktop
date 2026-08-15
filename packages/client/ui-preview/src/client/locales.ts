/** `preview` namespace dictionaries: local URL bar and desktop-only empty copy. */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'title': '浏览器',
  'placeholder': 'http://127.0.0.1:3000',
  'open': '打开',
  'unavailable': '浏览器预览仅在桌面应用中可用。',
  'empty': '输入本地应用或 URL。',
  'rejected': '只能预览本机地址。',
} satisfies Record<string, string>

/** The preview namespace key union. */
export type PreviewKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'title': 'Browser',
  'placeholder': 'http://127.0.0.1:3000',
  'open': 'Open',
  'unavailable': 'Browser previews are only available in the desktop app.',
  'empty': 'Open a local app or URL.',
  'rejected': 'Preview only opens local URLs.',
} satisfies Record<PreviewKey, string>

/** Dictionary namespace owned by this plugin. */
export const NS = 'preview'
