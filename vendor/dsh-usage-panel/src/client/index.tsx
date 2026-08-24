// dsh-usage-panel · Client entry (web plugin `./client` export).
// Registered into the DSH browser module loader via scripts/wrap-client.mjs;
// exports.apply + exports.inject are the loader contract. The settings page
// label is a thunk so the settings list re-reads the active language; locale
// switches re-render through the i18n subscription wired to 'locale/change'.
import { createElement } from 'react'
import * as uiPrimitives from '@deepseek-ai/dsh-client-ui-primitives'
import type { ClientCtx } from './ctx.ts'
import { createI18n } from './locales.ts'
import { CSS, STYLE_ID } from './styles.ts'
import { StatsSection } from './StatsSection.tsx'
import { Boundary } from './boundary.tsx'
import { missingPrimitives } from './primitives.ts'

export const inject = ['slots', 'connection', 'locale']

export function apply(ctx: ClientCtx): void {
  const gaps = missingPrimitives(uiPrimitives as Record<string, unknown>)
  if (gaps.length) {
    console.warn(
      '[dsh-usage-panel] host ui-primitives missing ' + gaps.join(', ') + ' — usage-stats section disabled',
    )
    return
  }

  let tag: HTMLStyleElement | null = null
  if (typeof document !== 'undefined' && document.querySelector('style[data-plugin-css="' + STYLE_ID + '"]') === null) {
    tag = document.createElement('style')
    tag.dataset.plugin = 'dsh-usage-panel'
    tag.dataset.pluginCss = STYLE_ID
    tag.textContent = CSS
    document.head.appendChild(tag)
  }

  const i18n = createI18n(ctx.locale)
  const disposeLocaleEvent = ctx.on ? ctx.on('locale/change', () => i18n.update()) : null

  const slots = ctx.slots
  slots.inject('settings.section', () =>
    slots.register(
      {
        name: 'settings.section',
        id: 'usage-stats',
        order: 25,
        label: () => i18n.t('nav.label'),
      },
      () => createElement(Boundary, { i18n }, createElement(StatsSection, { rpc: ctx.connection.rpc, i18n })),
    ),
  )

  ctx.effect(() => () => {
    if (tag !== null && tag.isConnected) tag.remove()
    if (disposeLocaleEvent) disposeLocaleEvent()
    i18n.dispose()
  })
}
