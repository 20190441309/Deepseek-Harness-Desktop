/**
 * Appearance page slot store: a mirror of the theme service snapshot. The
 * plugin's apply-world change listener is the only writer; the page reads
 * via props.useStore.
 */
import { defineStore, type EngineStoreHandle } from '@deepseek-ai/dsh-client-runtime/client'
import { DEFAULT_FAMILY_ID, type ThemeFamily } from '../theme-family.ts'
import { DEFAULT_THEME_SETTINGS, type ThemePreference, type ThemeSettings } from '../theme-settings.ts'

/** Fields the Appearance page mirrors from a theme snapshot. */
export interface AppearanceSyncSnapshot {
  /** Persisted color-scheme preference. */
  preference: ThemePreference
  /** Family painting the light half. */
  activeLightThemeId: string
  /** Family painting the dark half. */
  activeDarkThemeId: string
  /** Builtin plus custom families. */
  families: readonly ThemeFamily[]
  /** User-created families. */
  customThemes: readonly ThemeFamily[]
  /** Overlay solidity percent. */
  glassOpacity: number
  /** Interface font preference. */
  fontFamilySans: string
  /** Monospace font preference. */
  fontFamilyCode: string
  /** Root font size in px. */
  fontSizeInterface: number
  /** Code font size in px. */
  fontSizeCode: number
  /** Composer font preference. */
  fontFamilyComposer: string
  /** Terminal font preference. */
  fontFamilyTerminal: string
}

/** Store state mirrored from the theme snapshot. */
export interface AppearanceRowState {
  /** Persisted color-scheme preference. */
  preference: ThemePreference
  /** Family painting the light half. */
  activeLightThemeId: string
  /** Family painting the dark half. */
  activeDarkThemeId: string
  /** Builtin plus custom families. */
  families: readonly ThemeFamily[]
  /** User-created families. */
  customThemes: readonly ThemeFamily[]
  /** Overlay solidity percent. */
  glassOpacity: number
  /** Interface font preference. */
  fontFamilySans: string
  /** Monospace font preference. */
  fontFamilyCode: string
  /** Root font size in px. */
  fontSizeInterface: number
  /** Code font size in px. */
  fontSizeCode: number
  /** Composer font preference. */
  fontFamilyComposer: string
  /** Terminal font preference. */
  fontFamilyTerminal: string
  /** Service revision; -1 until first sync so revision 0 lands as a change. */
  revision: number
}

/** Declared action shape giving the exported factory a stable return type. */
type AppearanceRowActions = {
  sync: (draft: AppearanceRowState, snapshot: AppearanceSyncSnapshot, revision: number) => void
}

const EMPTY: Omit<AppearanceRowState, 'revision'> = {
  preference: DEFAULT_THEME_SETTINGS.preference,
  activeLightThemeId: DEFAULT_FAMILY_ID,
  activeDarkThemeId: DEFAULT_FAMILY_ID,
  families: [],
  customThemes: [],
  glassOpacity: DEFAULT_THEME_SETTINGS.glassOpacity,
  fontFamilySans: '',
  fontFamilyCode: '',
  fontSizeInterface: DEFAULT_THEME_SETTINGS.fontSizeInterface,
  fontSizeCode: DEFAULT_THEME_SETTINGS.fontSizeCode,
  fontFamilyComposer: '',
  fontFamilyTerminal: '',
}

/**
 * Declares the Appearance page state and write surface.
 * @returns the store handle.
 */
export function createAppearanceRowStore(): EngineStoreHandle<AppearanceRowState, AppearanceRowActions> {
  return defineStore({
    init: (): AppearanceRowState => ({ ...EMPTY, families: [], customThemes: [], revision: -1 }),
    actions: {
      sync: (d, snapshot: AppearanceSyncSnapshot, revision: number) => {
        if (revision <= d.revision) return
        d.preference = snapshot.preference
        d.activeLightThemeId = snapshot.activeLightThemeId
        d.activeDarkThemeId = snapshot.activeDarkThemeId
        d.families = snapshot.families
        d.customThemes = snapshot.customThemes
        d.glassOpacity = snapshot.glassOpacity
        d.fontFamilySans = snapshot.fontFamilySans
        d.fontFamilyCode = snapshot.fontFamilyCode
        d.fontSizeInterface = snapshot.fontSizeInterface
        d.fontSizeCode = snapshot.fontSizeCode
        d.fontFamilyComposer = snapshot.fontFamilyComposer
        d.fontFamilyTerminal = snapshot.fontFamilyTerminal
        d.revision = revision
      },
    },
  })
}

export type { ThemeSettings }
