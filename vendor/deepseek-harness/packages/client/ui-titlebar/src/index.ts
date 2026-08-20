/** Host loader entry for the browser-only titlebar plugin. */

import type { Context } from '@deepseek-ai/cordis'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'
import { TITLEBAR_SETTINGS_NAMESPACE, TitlebarSettingsSchema } from './titlebar-settings.ts'

export {
  DEFAULT_PANEL_TOGGLE, SURFACES_TOGGLE_FIELD, TERMINAL_TOGGLE_FIELD, TITLEBAR_SETTINGS_NAMESPACE,
  type TitlebarSettings,
} from './titlebar-settings.ts'

/**
 * Register the durable panel-toggle visibility section when a settings provider exists.
 * @param ctx - Host context whose optional settings service owns the section.
 */
export function apply(ctx: Context): void {
  ctx.inject(['settings'], (settingsCtx) => {
    settingsCtx.settings.register(
      settingsNamespace(TITLEBAR_SETTINGS_NAMESPACE),
      TitlebarSettingsSchema,
    )
  })
}
