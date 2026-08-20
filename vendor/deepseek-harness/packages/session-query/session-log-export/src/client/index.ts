/** Browser plugin owning Session export download state and its shared modal. */

import type { ClientContext, SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-commands/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import { SessionLogDownloadController } from './controller.ts'
import type { SessionLogDownloadDialogInjected } from './Dialog.tsx'
import { SessionLogDownloadHeaderAction } from './HeaderAction.tsx'
import type { SessionLogChromeRowInjected } from './SessionLogChromeRow.tsx'
import { SessionLogChromeRow } from './SessionLogChromeRow.tsx'
import { ChromeVisibility } from './chrome-visibility.ts'
import {
  SESSION_LOG_EXPORT_SETTINGS_NAMESPACE, TITLEBAR_ACTION_FIELD,
  type SessionLogExportSettings,
} from '../export-settings.ts'
import { en, NS, zh, type SessionLogDownloadKey } from './locales.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    sessionLogDownload: SessionLogDownloadController
  }
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'session-log-download': SessionLogDownloadKey
  }
}

export type { SessionLogDownloadEntry, SessionLogDownloadState } from './controller.ts'

export const inject = ['slots', 'locale', 'connection', 'remote', 'settingsScope']

/**
 * Provide the download controller, mount its button into the titlebar trailing
 * cluster, and contribute the Interface Settings row.
 * @param ctx - browser context carrying slots and locale services.
 */
export function apply(ctx: ClientContext): void {
  const controller = new SessionLogDownloadController()
  ctx.provide('sessionLogDownload', controller)
  ctx.effect(() => async () => { await controller.dispose() }, 'session-log-download: browser download lifecycle')
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'session-log-download: browser dictionaries')
  const titlebarAction = new ChromeVisibility<SessionLogExportSettings>(
    ctx.settingsScope.bind<SessionLogExportSettings>({ namespace: SESSION_LOG_EXPORT_SETTINGS_NAMESPACE }),
    TITLEBAR_ACTION_FIELD,
  )
  ctx.on('command/executed', (sessionId, commandName, result) => {
    if (commandName === 'export' && result.kind === 'success') void controller.download(sessionId)
  })
  ctx.slots.inject('shell.titlebar.trailing', () => ctx.slots.register({
    name: 'shell.titlebar.trailing',
    id: 'session-log-download',
    order: 10,
    locale: NS,
    inject: (): SessionLogDownloadDialogInjected => ({
      hooks: {
        sessionLogDownload: controller.store,
        titlebarAction: titlebarAction.visible,
      },
      request: (sessionId: SessionId) => controller.download(sessionId),
      dismiss: (sessionId: SessionId) => { controller.dismiss(sessionId) },
    }),
  }, SessionLogDownloadHeaderAction))
  ctx.slots.inject('settings.interface.item', () => ctx.slots.register({
    name: 'settings.interface.item',
    id: 'session-log-export',
    order: 10,
    locale: NS,
    inject: (): SessionLogChromeRowInjected => ({
      hooks: { titlebarAction: titlebarAction.visible, writable: titlebarAction.writable },
      setTitlebarAction: (value) => { titlebarAction.setVisible(value) },
    }),
  }, SessionLogChromeRow))
}

export type {
  SessionLogDownloadDialogInjected,
  SessionLogDownloadDialogProps,
  SessionLogDownloadDialogRenderProps,
} from './Dialog.tsx'
