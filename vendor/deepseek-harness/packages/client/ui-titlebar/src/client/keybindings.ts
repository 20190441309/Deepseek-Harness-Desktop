/** Titlebar panel shortcut matching: skip inputs, textareas, and the terminal pane. */

/** Production terminal host marker rendered by ui-user-terminal's TerminalPane. */
const TERMINAL_PANE_SELECTOR = '[data-terminal-pane]'

/**
 * True when a keydown target is an editable field or the terminal, so panel
 * shortcuts must not steal the key.
 * @param target - event target.
 * @returns whether the shortcut listener should ignore this event.
 */
export function isEditableKeyboardTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.closest(TERMINAL_PANE_SELECTOR) !== null) return true
  return isTextEntryTarget(target)
}

/**
 * True when a keydown target is a text entry field (not the terminal). The
 * terminal-drawer toggle still applies while typing inside the terminal, so
 * its shortcut checks this instead of {@link isEditableKeyboardTarget}.
 * The Ghostty surface proxies keystrokes through a hidden textarea inside the
 * pane host; that textarea is the terminal, not a text entry field.
 * @param target - event target.
 * @returns whether the target is a text input.
 */
export function isTextEntryTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.closest(TERMINAL_PANE_SELECTOR) !== null) return false
  const tag = target.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  const contentEditable = target.contentEditable
  if (contentEditable === 'true' || contentEditable === 'plaintext-only') return true
  return target.isContentEditable || target.getAttribute('contenteditable') === 'true'
}

/**
 * True for Ctrl/Cmd+\\ (surfaces column).
 * @param event - keydown event.
 * @returns true when the surfaces column shortcut fired.
 */
export function isSurfacesShortcut(event: KeyboardEvent): boolean {
  if (!event.ctrlKey && !event.metaKey) return false
  return event.key === '\\' || event.code === 'Backslash'
}

/**
 * True for Ctrl/Cmd+` (terminal drawer).
 * @param event - keydown event.
 * @returns true when the terminal drawer shortcut fired.
 */
export function isTerminalShortcut(event: KeyboardEvent): boolean {
  if (!event.ctrlKey && !event.metaKey) return false
  return event.key === '`' || event.code === 'Backquote'
}
