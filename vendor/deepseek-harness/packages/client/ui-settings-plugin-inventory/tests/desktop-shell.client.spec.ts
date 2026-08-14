// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { desktopShell } from '../src/client/desktop-shell.ts'

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
