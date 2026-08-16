// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import {
  FALLBACK_TERMINAL_FONT_FAMILY,
  readXtermFont,
  readXtermTheme,
} from '../src/client/terminal-theme.ts'

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

describe('readXtermFont', () => {
  it('falls back to a monospace stack when CSS families do not resolve', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const font = readXtermFont(host)
    expect(font.fontFamily.includes('var(')).toBe(false)
    expect(font.fontFamily).toBe(FALLBACK_TERMINAL_FONT_FAMILY)
    expect(font.fontSize).toBe(13)
    expect(font.lineHeight).toBe(1.2)
    host.remove()
  })

  it('uses the probe computed family when it is a concrete stack', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const real = window.getComputedStyle.bind(window)
    const spy = vi.spyOn(window, 'getComputedStyle').mockImplementation((el: Element) => {
      const styles = real(el)
      if (el instanceof HTMLSpanElement && el.style.fontFamily.includes('--dsw-font-family-terminal')) {
        return new Proxy(styles, {
          get(target, prop, receiver) {
            if (prop === 'fontFamily') return '"SF Mono"'
            return Reflect.get(target, prop, receiver)
          },
        })
      }
      return styles
    })
    const font = readXtermFont(host)
    expect(font.fontFamily).toBe('"SF Mono"')
    spy.mockRestore()
    host.remove()
  })

  it('reads --dsw-font-family-terminal and --dsw-font-size-code from the host', () => {
    const host = document.createElement('div')
    host.style.setProperty('--dsw-font-family-terminal', '"IBM Plex Mono"')
    host.style.setProperty('--dsw-font-size-code', '14px')
    document.body.appendChild(host)
    const font = readXtermFont(host)
    expect(font.fontFamily).toContain('IBM Plex Mono')
    expect(font.fontFamily.includes('var(')).toBe(false)
    expect(font.fontSize).toBe(14)
    expect(font.lineHeight).toBe(1.2)
    host.remove()
  })

  it('falls back from --dsw-font-family-terminal to --ds-font-family-code', () => {
    const host = document.createElement('div')
    host.style.setProperty('--dsw-font-family-terminal', 'var(--missing)')
    host.style.setProperty('--ds-font-family-code', '"JetBrains Mono"')
    document.body.appendChild(host)
    const font = readXtermFont(host)
    expect(font.fontFamily).toContain('JetBrains Mono')
    host.remove()
  })

  it('ignores a non-positive --dsw-font-size-code', () => {
    const host = document.createElement('div')
    host.style.setProperty('--dsw-font-size-code', '0px')
    document.body.appendChild(host)
    expect(readXtermFont(host).fontSize).toBe(13)
    host.style.setProperty('--dsw-font-size-code', 'nope')
    expect(readXtermFont(host).fontSize).toBe(13)
    host.remove()
  })
})
