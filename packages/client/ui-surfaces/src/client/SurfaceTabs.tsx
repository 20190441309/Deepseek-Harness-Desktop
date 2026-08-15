import type { ReactNode } from 'react'
import clsx from 'clsx'
import { IconCloseOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { NS } from './locales.ts'
import type { Surface } from './stores.ts'
import css from './SurfaceTabs.module.css'

export type SurfaceTabsProps = PropsLocale<typeof NS> & {
  surfaces: readonly Surface[]
  activeId: string | null
  onActivate: (id: string) => void
  onClose: (id: string) => void
}

/**
 * Tab title for a surface descriptor.
 * @param surface - the surface.
 * @param t - locale translate.
 * @returns the tab label.
 */
export function surfaceTitle(surface: Surface, t: SurfaceTabsProps['t']): string {
  switch (surface.kind) {
    case 'preview':
      return t('card.browser')
    case 'terminal':
      return t('card.terminal')
    case 'files':
      return t('card.files')
    case 'diff':
      return t('card.diff')
    case 'agents':
      return t('card.agents')
    case 'file': {
      const slash = surface.relativePath.lastIndexOf('/')
      return slash < 0 ? surface.relativePath : surface.relativePath.slice(slash + 1)
    }
    default: {
      const _never: never = surface
      return _never
    }
  }
}

/**
 * Surface tab strip: activate on click, close on the trailing button.
 * @param props - surfaces, the active id, callbacks, and copy.
 * @returns the tab bar.
 */
export function SurfaceTabs({ surfaces, activeId, onActivate, onClose, t }: SurfaceTabsProps): ReactNode {
  return (
    <div className={css.bar} data-surfaces-tabs>
      {surfaces.map(surface => {
        const title = surfaceTitle(surface, t)
        const active = surface.id === activeId
        return (
          <div
            key={surface.id}
            className={clsx(css.tab, active && css.active)}
            data-active-tab={active || undefined}
          >
            <button
              type="button"
              className={css.label}
              onClick={() => { onActivate(surface.id) }}
            >
              {title}
            </button>
            <button
              type="button"
              className={css.close}
              aria-label={`${t('tab.close')} ${title}`}
              onClick={() => { onClose(surface.id) }}
            >
              <IconCloseOutline16 size={12} />
            </button>
          </div>
        )
      })}
    </div>
  )
}
