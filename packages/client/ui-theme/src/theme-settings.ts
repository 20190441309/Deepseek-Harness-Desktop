/** Theme preferences stored in the Host user-settings document. */

import z from '@deepseek-ai/schemastery'
import {
  DEFAULT_CODE_FONT_SIZE,
  DEFAULT_FAMILY_ID,
  DEFAULT_GLASS_OPACITY,
  DEFAULT_INTERFACE_FONT_SIZE,
  MAX_CODE_FONT_SIZE,
  MAX_GLASS_OPACITY,
  MAX_INTERFACE_FONT_SIZE,
  MIN_CODE_FONT_SIZE,
  MIN_GLASS_OPACITY,
  MIN_INTERFACE_FONT_SIZE,
  ThemeFamilySchema,
  type ThemeFamily,
} from './theme-family.ts'

/** Built-in preferences accepted at the registry and settings boundaries. */
export const THEME_PREFERENCES = ['light', 'dark', 'system'] as const

/** Settings namespace owned by the theme plugin. */
export const THEME_SETTINGS_NAMESPACE = 'ui-theme'

/** Field carrying the selected built-in theme preference. */
export const THEME_PREFERENCE_FIELD = 'preference'

/** Field carrying the light-half family id. */
export const THEME_LIGHT_FAMILY_FIELD = 'activeLightThemeId'

/** Field carrying the dark-half family id. */
export const THEME_DARK_FAMILY_FIELD = 'activeDarkThemeId'

/** Field carrying user-created families. */
export const THEME_CUSTOM_THEMES_FIELD = 'customThemes'

/** Field carrying glass-surface opacity. */
export const THEME_GLASS_OPACITY_FIELD = 'glassOpacity'

/** Theme preference persisted by the product Appearance page. */
export type ThemePreference = typeof THEME_PREFERENCES[number]

/** Default preference when the user-settings document has no override. */
export const DEFAULT_PREFERENCE: ThemePreference = 'system'

/** Durable theme section shared by the Host schema and the browser scope. */
export interface ThemeSettings {
  /** Selected built-in color-scheme preference. */
  preference: ThemePreference
  /** Family that paints the light half. */
  activeLightThemeId: string
  /** Family that paints the dark half. */
  activeDarkThemeId: string
  /** User-created families persisted across reloads. */
  customThemes: ThemeFamily[]
  /** Overlay / menu / composer solidity, 40–100. */
  glassOpacity: number
  /** Optional interface font-family override; empty keeps the sheet stack. */
  fontFamilySans: string
  /** Optional monospace font-family override; empty keeps the sheet stack. */
  fontFamilyCode: string
  /** Root interface font size in px. */
  fontSizeInterface: number
  /** Code / diff font size in px. */
  fontSizeCode: number
  /** Optional composer font-family override; empty follows the interface stack. */
  fontFamilyComposer: string
  /** Optional terminal font-family override; empty follows the monospace stack. */
  fontFamilyTerminal: string
}

/** Default durable section used when Host has no override. */
export const DEFAULT_THEME_SETTINGS: ThemeSettings = {
  preference: DEFAULT_PREFERENCE,
  activeLightThemeId: DEFAULT_FAMILY_ID,
  activeDarkThemeId: DEFAULT_FAMILY_ID,
  customThemes: [],
  glassOpacity: DEFAULT_GLASS_OPACITY,
  fontFamilySans: '',
  fontFamilyCode: '',
  fontSizeInterface: DEFAULT_INTERFACE_FONT_SIZE,
  fontSizeCode: DEFAULT_CODE_FONT_SIZE,
  fontFamilyComposer: '',
  fontFamilyTerminal: '',
}

/** Durable theme schema; also the wire envelope the browser scope validates against. */
export const ThemeSettingsSchema: z<ThemeSettings> = z.object({
  [THEME_PREFERENCE_FIELD]: z.union([...THEME_PREFERENCES]).default(DEFAULT_PREFERENCE),
  [THEME_LIGHT_FAMILY_FIELD]: z.string().default(DEFAULT_FAMILY_ID),
  [THEME_DARK_FAMILY_FIELD]: z.string().default(DEFAULT_FAMILY_ID),
  [THEME_CUSTOM_THEMES_FIELD]: z.array(ThemeFamilySchema).default([]),
  [THEME_GLASS_OPACITY_FIELD]: z.number().min(MIN_GLASS_OPACITY).max(MAX_GLASS_OPACITY)
    .default(DEFAULT_GLASS_OPACITY),
  fontFamilySans: z.string().default(''),
  fontFamilyCode: z.string().default(''),
  fontSizeInterface: z.number().min(MIN_INTERFACE_FONT_SIZE).max(MAX_INTERFACE_FONT_SIZE)
    .default(DEFAULT_INTERFACE_FONT_SIZE),
  fontSizeCode: z.number().min(MIN_CODE_FONT_SIZE).max(MAX_CODE_FONT_SIZE)
    .default(DEFAULT_CODE_FONT_SIZE),
  fontFamilyComposer: z.string().default(''),
  fontFamilyTerminal: z.string().default(''),
})

/**
 * Narrow one wire or registry value to a persistable preference.
 * @param value - value crossing the settings or registry boundary.
 * @returns whether the value is a built-in preference.
 */
export function isThemePreference(value: unknown): value is ThemePreference {
  return THEME_PREFERENCES.some(preference => preference === value)
}

/**
 * Fill missing fields on a partial Host section with product defaults.
 * @param section - accepted Host value, or undefined before the first read.
 * @returns a complete settings object.
 */
export function resolveThemeSettings(section: ThemeSettings | undefined): ThemeSettings {
  if (section === undefined) return { ...DEFAULT_THEME_SETTINGS, customThemes: [] }
  return {
    ...DEFAULT_THEME_SETTINGS,
    ...section,
    customThemes: section.customThemes ?? [],
  }
}
