/** `titlebar` namespace dictionaries: terminal drawer and surfaces toggles. */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'terminal.toggle': '切换终端抽屉',
  'terminal.unavailable': '终端抽屉不可用',
  'surfaces.toggle': '切换右侧栏',
  'shortcut.terminal': 'Ctrl+`',
  'shortcut.surfaces': 'Ctrl+\\',
  'settings.terminalToggle.title': '终端抽屉开关',
  'settings.terminalToggle.description': '在标题栏显示终端抽屉按钮。关闭后仍可使用 Ctrl+` 切换。',
  'settings.surfacesToggle.title': '右侧面板开关',
  'settings.surfacesToggle.description': '在标题栏显示右侧栏按钮。关闭后仍可使用 Ctrl+\\ 切换。',
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
  'settings.terminalToggle.title': 'Terminal drawer toggle',
  'settings.terminalToggle.description': 'Show the terminal drawer button in the titlebar. Turning this off still leaves Ctrl+` available.',
  'settings.surfacesToggle.title': 'Right panel toggle',
  'settings.surfacesToggle.description': 'Show the right-panel button in the titlebar. Turning this off still leaves Ctrl+\\ available.',
} satisfies Record<TitlebarKey, string>

/** Dictionary namespace owned by this plugin. */
export const NS = 'titlebar'
