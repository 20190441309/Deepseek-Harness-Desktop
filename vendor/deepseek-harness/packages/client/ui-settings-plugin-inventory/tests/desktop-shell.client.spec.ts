// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { catalogLocale, desktopShell } from '../src/client/desktop-shell.ts'

describe('desktopShell', () => {
  it('returns null without a shell bridge', () => {
    delete (window as Window & { shell?: unknown }).shell
    expect(desktopShell()).toBeNull()
  })

  it('returns the preload object when present', () => {
    const api = { listMarketplace: async () => ({ items: [] }) }
    ;(window as Window & { shell?: unknown }).shell = api
    expect(desktopShell()).toBe(api)
    delete (window as Window & { shell?: unknown }).shell
  })
})

describe('catalogLocale', () => {
  it('maps zh-prefixed tags to zh and everything else to en', () => {
    expect(catalogLocale('zh')).toBe('zh')
    expect(catalogLocale('zh-CN')).toBe('zh')
    expect(catalogLocale('en')).toBe('en')
    expect(catalogLocale('en-US')).toBe('en')
  })
})

