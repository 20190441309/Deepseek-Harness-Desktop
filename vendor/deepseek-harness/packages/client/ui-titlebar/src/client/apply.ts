/** Registers the titlebar panel toggles into the layout-owned trailing cluster. */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type { PanelTogglesInjected } from './PanelToggles.tsx'
import { PanelToggles } from './PanelToggles.tsx'
import { en, NS, zh, type TitlebarKey } from './locales.ts'

export type { PanelTogglesInjected, PanelTogglesProps } from './PanelToggles.tsx'
export type { TitlebarKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Titlebar panel-toggle copy. */
    titlebar: TitlebarKey
  }
}

/** Services required by the titlebar plugin. */
export const inject = ['slots', 'layout', 'locale']

/**
 * Register the dictionaries and inject the panel toggles at order 40.
 * @param ctx - Client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-titlebar: dictionaries')

  ctx.slots.inject('shell.titlebar.trailing', () => ctx.slots.register({
    name: 'shell.titlebar.trailing',
    id: 'panel-toggles',
    order: 40,
    locale: NS,
    inject: (): PanelTogglesInjected => ({
      toggleSurfaces: () => { ctx.layout.toggleSurfaces() },
      toggleTerminalDrawer: () => { ctx.layout.toggleTerminalDrawer() },
    }),
  }, PanelToggles))
}
