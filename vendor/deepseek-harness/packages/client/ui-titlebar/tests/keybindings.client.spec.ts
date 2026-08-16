// @vitest-environment jsdom
/**
 * Titlebar shortcut helpers: skip editable targets and match panel chords.
 */
import { describe, expect, it } from 'vitest'
import {
  isEditableKeyboardTarget, isSurfacesShortcut, isTerminalShortcut,
} from '../src/client/keybindings.ts'

describe('titlebar keybindings', () => {
  it('treats input, textarea, select, contenteditable, and xterm as editable', () => {
    expect(isEditableKeyboardTarget(null)).toBe(false)
    const input = document.createElement('input')
    const textarea = document.createElement('textarea')
    const select = document.createElement('select')
    const editable = document.createElement('div')
    editable.contentEditable = 'true'
    editable.setAttribute('contenteditable', 'true')
    const xterm = document.createElement('div')
    xterm.className = 'xterm'
    const inner = document.createElement('span')
    xterm.append(inner)
    expect(isEditableKeyboardTarget(input)).toBe(true)
    expect(isEditableKeyboardTarget(textarea)).toBe(true)
    expect(isEditableKeyboardTarget(select)).toBe(true)
    expect(isEditableKeyboardTarget(editable)).toBe(true)
    expect(isEditableKeyboardTarget(inner)).toBe(true)
    expect(isEditableKeyboardTarget(document.createElement('div'))).toBe(false)
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
