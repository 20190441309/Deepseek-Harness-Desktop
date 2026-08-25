// @vitest-environment jsdom
/**
 * Titlebar shortcut helpers: skip editable targets and match panel chords.
 */
import { describe, expect, it } from 'vitest'
import {
  isEditableKeyboardTarget, isSurfacesShortcut, isTerminalShortcut, isTextEntryTarget,
} from '../src/client/keybindings.ts'

describe('titlebar keybindings', () => {
  it('treats input, textarea, select, contenteditable, and the terminal pane as editable', () => {
    expect(isEditableKeyboardTarget(null)).toBe(false)
    const input = document.createElement('input')
    const textarea = document.createElement('textarea')
    const select = document.createElement('select')
    const editable = document.createElement('div')
    editable.contentEditable = 'true'
    editable.setAttribute('contenteditable', 'true')
    const pane = document.createElement('div')
    pane.setAttribute('data-terminal-pane', 'pty-1')
    const inner = document.createElement('span')
    pane.append(inner)
    expect(isEditableKeyboardTarget(input)).toBe(true)
    expect(isEditableKeyboardTarget(textarea)).toBe(true)
    expect(isEditableKeyboardTarget(select)).toBe(true)
    expect(isEditableKeyboardTarget(editable)).toBe(true)
    expect(isEditableKeyboardTarget(inner)).toBe(true)
    expect(isEditableKeyboardTarget(document.createElement('div'))).toBe(false)
  })

  it('exempts the Ghostty input textarea inside the pane from text-entry blocking', () => {
    const pane = document.createElement('div')
    pane.setAttribute('data-terminal-pane', 'pty-1')
    const ghosttyInput = document.createElement('textarea')
    pane.append(ghosttyInput)
    // The drawer shortcut listener checks isTextEntryTarget: the terminal's
    // hidden input proxy must not block Ctrl+` while typing in the terminal.
    expect(isTextEntryTarget(ghosttyInput)).toBe(false)
    expect(isEditableKeyboardTarget(ghosttyInput)).toBe(true)
    const plainTextarea = document.createElement('textarea')
    expect(isTextEntryTarget(plainTextarea)).toBe(true)
    expect(isTextEntryTarget(null)).toBe(false)
  })

  it('matches surfaces and terminal chords with ctrl or meta', () => {
    expect(isSurfacesShortcut(new KeyboardEvent('keydown', { key: '\\', ctrlKey: true }))).toBe(true)
    expect(isSurfacesShortcut(new KeyboardEvent('keydown', { code: 'Backslash', metaKey: true }))).toBe(true)
    expect(isSurfacesShortcut(new KeyboardEvent('keydown', { key: '\\' }))).toBe(false)
    expect(isTerminalShortcut(new KeyboardEvent('keydown', { key: '`', ctrlKey: true }))).toBe(true)
    expect(isTerminalShortcut(new KeyboardEvent('keydown', { code: 'Backquote', metaKey: true }))).toBe(true)
    expect(isTerminalShortcut(new KeyboardEvent('keydown', { key: '`', shiftKey: true }))).toBe(false)
  })
})
