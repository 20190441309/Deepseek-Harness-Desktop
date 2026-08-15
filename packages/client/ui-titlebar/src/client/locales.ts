/** `titlebar` namespace dictionaries: terminal drawer and surfaces toggles. */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'terminal.toggle': '切换终端抽屉',
  'terminal.unavailable': '终端抽屉不可用',
  'surfaces.toggle': '切换右侧栏',
  'shortcut.terminal': 'Ctrl+`',
  'shortcut.surfaces': 'Ctrl+\\',
} satisfies Record<string, string>

/** The titlebar namespace key union. */
export type TitlebarKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'terminal.toggle': 'Toggle terminal drawer',
  'terminal.unavailable': 'Terminal drawer is unavailable',
  'surfaces.toggle': 'Toggle right panel',
  'shortcut.terminal': 'Ctrl+`',
  'shortcut.surfaces': 'Ctrl+\\',
} satisfies Record<TitlebarKey, string>

/** Dictionary namespace owned by this plugin. */
export const NS = 'titlebar'
