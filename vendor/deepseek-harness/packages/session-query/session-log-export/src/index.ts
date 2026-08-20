/** Web Session-log download command over the host endpoint owned by ApiProxy. */

import type { Context } from '@deepseek-ai/cordis'
import type { CommandResult } from '@deepseek-ai/dsh-commands'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'
import { SESSION_LOG_EXPORT_SETTINGS_NAMESPACE, SessionLogExportSettingsSchema } from './export-settings.ts'

export {
  DEFAULT_TITLEBAR_ACTION, SESSION_LOG_EXPORT_SETTINGS_NAMESPACE, TITLEBAR_ACTION_FIELD,
  type SessionLogExportSettings,
} from './export-settings.ts'

export const name = 'session-log-download'
export const inject = ['commands']

const REQUESTED: CommandResult = {
  kind: 'success',
  text: 'Session log download requested.',
}

/**
 * Register the Web-only `/export` command that the browser download plugin observes,
 * and the durable titlebar-visibility section when a settings provider exists.
 * @param ctx - Host context carrying the human-command registry.
 */
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.commands.register({
    name: 'export',
    description: 'Download this Session log as a ZIP archive',
    handler: invocation => Promise.resolve(invocation.rawInput.trim() === ''
      ? REQUESTED
      : { kind: 'error', text: 'The Web /export command does not accept a path.' }),
  }), 'session-log-download: command')
  ctx.inject(['settings'], (settingsCtx) => {
    settingsCtx.settings.register(
      settingsNamespace(SESSION_LOG_EXPORT_SETTINGS_NAMESPACE),
      SessionLogExportSettingsSchema,
    )
  })
}
