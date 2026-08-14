/** Appearance page store: snapshot-mirror action and the revision guard. */
import { describe, expect, it } from 'vitest'
import { createAppearanceRowStore } from '../src/client/settings-store.ts'
import type { AppearanceSyncSnapshot } from '../src/client/settings-store.ts'
import { DEFAULT_THEME_SETTINGS } from '../src/theme-settings.ts'

function snap(overrides: Partial<AppearanceSyncSnapshot> = {}): AppearanceSyncSnapshot {
  return {
    preference: DEFAULT_THEME_SETTINGS.preference,
    activeLightThemeId: 'deepseek',
    activeDarkThemeId: 'deepseek',
    families: [],
    customThemes: [],
    glassOpacity: DEFAULT_THEME_SETTINGS.glassOpacity,
    wallpaperImage: '',
    wallpaperBlur: 0,
    wallpaperPixelate: 0,
    fontFamilySans: '',
    fontFamilyCode: '',
    fontSizeInterface: DEFAULT_THEME_SETTINGS.fontSizeInterface,
    fontSizeCode: DEFAULT_THEME_SETTINGS.fontSizeCode,
    fontFamilyComposer: '',
    fontFamilyTerminal: '',
    ...overrides,
  }
}

describe('createAppearanceRowStore', () => {
  it('init shape: system preference with revision at -1', () => {
    const store = createAppearanceRowStore().create()
    expect(store.getSnapshot()).toMatchObject({ preference: 'system', revision: -1, glassOpacity: 80 })
  })

  it('sync mirrors the snapshot and advances the revision', () => {
    const store = createAppearanceRowStore().create()
    store.actions.sync(snap({ preference: 'dark', glassOpacity: 60, wallpaperBlur: 15 }), 0)
    expect(store.getSnapshot()).toMatchObject({
      preference: 'dark', glassOpacity: 60, wallpaperBlur: 15, revision: 0,
    })
    store.actions.sync(snap({ preference: 'light' }), 2)
    expect(store.getSnapshot().preference).toBe('light')
    expect(store.getSnapshot().revision).toBe(2)
  })

  it('revision guard drops stale and duplicate writes', () => {
    const store = createAppearanceRowStore().create()
    store.actions.sync(snap({ preference: 'dark' }), 3)
    store.actions.sync(snap({ preference: 'system' }), 2)
    store.actions.sync(snap({ preference: 'system' }), 3)
    expect(store.getSnapshot().preference).toBe('dark')
    expect(store.getSnapshot().revision).toBe(3)
  })
})
