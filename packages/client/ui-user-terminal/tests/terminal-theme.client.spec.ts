// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { readXtermTheme } from '../src/client/terminal-theme.ts'

describe('readXtermTheme', () => {
  it('reads the host background and color', () => {
    const host = document.createElement('div')
    host.style.backgroundColor = 'rgb(10, 20, 30)'
    host.style.color = 'rgb(200, 210, 220)'
    document.body.appendChild(host)
    const theme = readXtermTheme(host)
    expect(theme.background).toBe('rgb(10, 20, 30)')
    expect(theme.foreground).toBe('rgb(200, 210, 220)')
    expect(theme.cursor).toBe('rgb(200, 210, 220)')
    expect(theme.cursorAccent).toBe('rgb(10, 20, 30)')
    host.remove()
  })

  it('falls back when the host has no computed colors', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const theme = readXtermTheme(host)
    expect(theme.background).toMatch(/^rgb\(/)
    expect(theme.foreground).toMatch(/^rgb\(/)
    expect(theme.red).toMatch(/^rgb\(/)
    host.remove()
  })
})
