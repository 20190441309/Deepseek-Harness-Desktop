/** Host registration for the browser theme preference and pre-plugin palette. */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'
import { buildThemeBootPayload, injectBootTheme } from './boot-theme.ts'
import {
  THEME_SETTINGS_NAMESPACE, ThemeSettingsSchema, type ThemeSettings,
} from './theme-settings.ts'

export {
  DEFAULT_PREFERENCE, DEFAULT_THEME_SETTINGS, THEME_PREFERENCE_FIELD, THEME_PREFERENCES,
  THEME_SETTINGS_NAMESPACE, type ThemePreference, type ThemeSettings,
} from './theme-settings.ts'
export { buildThemeBootPayload, injectBootTheme } from './boot-theme.ts'
export type { ThemeBootPayload } from './boot-theme.ts'

const THEME_NAMESPACE = settingsNamespace(THEME_SETTINGS_NAMESPACE)

/** Read the registered section, or undefined when no settings provider is composed. */
function readSection(ctx: Context): ThemeSettings | undefined {
  const settings = ctx.get('settings')
  if (settings === undefined) return undefined
  return settings.get(THEME_NAMESPACE) as ThemeSettings | undefined
}

/**
 * Register the durable theme section and initial-theme index transform when
 * their optional Host services are composed.
 * @param ctx - Host context that may acquire settings and HTTP services.
 */
export function apply(ctx: Context): void {
  ctx.inject(['settings'], (settingsCtx) => {
    settingsCtx.settings.register(THEME_NAMESPACE, ThemeSettingsSchema)
  })
  ctx.inject(['webServer'], (httpCtx) => {
    httpCtx.effect(
      () => httpCtx.webServer.tapIndex(html => injectBootTheme(html, buildThemeBootPayload(readSection(ctx)))),
      'client-ui-theme: initial theme bootstrap',
    )
  })
}
