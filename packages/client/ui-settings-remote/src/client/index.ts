/** Desktop-gated Remote popup registered next to Settings. */

import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import { desktopShell, hasRemoteApi } from './desktop-shell.ts'
import { RemoteSection, type RemoteSectionInjected } from './RemoteSection.tsx'
import { en, zh, type RemoteLocaleKey } from './locales.ts'

export type { RemoteSectionInjected, RemoteSectionProps } from './RemoteSection.tsx'
export type { RemoteLocaleKey } from './locales.ts'
export type { RemotePatch, RemoteSnapshot, RemoteDevice } from './desktop-shell.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Remote popup copy. */
    'settings.remote': RemoteLocaleKey
  }
}

/** Dictionary namespace owned by this plugin. */
export const NS = 'settings.remote'

/** Services required by the sidebar registration. */
export const inject = ['slots', 'locale']

/**
 * Contribute the Remote control only when the desktop shell exposes remote APIs.
 * @param ctx - client context with slots and locale.
 * @returns nothing; slot registration is an effect when the desktop API is present.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-settings-remote: dictionaries')

  const shell = desktopShell()
  if (!hasRemoteApi(shell)) return

  const injected = (): RemoteSectionInjected => ({
    getRemote: () => shell.getRemote(),
    saveRemote: patch => shell.saveRemote(patch),
    unbindRemoteDevice: id => shell.unbindRemoteDevice(id),
  })

  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action',
    id: 'remote',
    order: 80,
    locale: NS,
    inject: injected,
  }, RemoteSection))
}
