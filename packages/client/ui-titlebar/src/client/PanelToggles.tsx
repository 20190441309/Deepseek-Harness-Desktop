import { useEffect, type ReactNode } from 'react'
import clsx from 'clsx'
import {
  IconPanelBottomOutline16, IconPanelRightOutline16, Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import { NS } from './locales.ts'
import css from './PanelToggles.module.css'

/** Layout writes injected into the titlebar trailing contribution. */
export interface PanelTogglesInjected {
  toggleSurfaces: () => void
  toggleTerminalDrawer: () => void
}

export type PanelTogglesProps =
  PropsRuntime<'shell.titlebar.trailing'>
  & PropsLocale<typeof NS>
  & InjectFace<PanelTogglesInjected>

/**
 * Render the titlebar terminal-drawer and surfaces-column ghost toggles.
 * @param props - layout widths, workspace list, toggle callbacks, and copy.
 * @returns the two icon toggles.
 */
export function PanelToggles({
  surfaces,
  terminalDrawer,
  useWorkspaces,
  toggleSurfaces,
  toggleTerminalDrawer,
  t,
}: PanelTogglesProps): ReactNode {
  const terminalAvailable = useWorkspaces(s => s.items.length > 0)
  const terminalOpen = terminalDrawer > 0
  const surfacesOpen = surfaces > 0

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!event.ctrlKey && !event.metaKey) return
      if (event.key !== '\\' && event.code !== 'Backslash') return
      event.preventDefault()
      toggleSurfaces()
    }
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('keydown', onKey) }
  }, [toggleSurfaces])

  return (
    <div className={css.cluster} data-panel-layout-controls>
      <Tooltip
        label={terminalAvailable
          ? `${t('terminal.toggle')} (${t('shortcut.terminal')})`
          : t('terminal.unavailable')}
        side="bottom"
      >
        <button
          type="button"
          className={clsx(css.toggle, terminalOpen && css.pressed)}
          aria-label={t('terminal.toggle')}
          aria-pressed={terminalOpen}
          disabled={!terminalAvailable}
          onClick={() => { toggleTerminalDrawer() }}
        >
          <IconPanelBottomOutline16 size={14} />
        </button>
      </Tooltip>
      <Tooltip
        label={`${t('surfaces.toggle')} (${t('shortcut.surfaces')})`}
        side="bottom"
      >
        <button
          type="button"
          className={clsx(css.toggle, surfacesOpen && css.pressed)}
          aria-label={t('surfaces.toggle')}
          aria-pressed={surfacesOpen}
          onClick={() => { toggleSurfaces() }}
        >
          <IconPanelRightOutline16 size={14} />
        </button>
      </Tooltip>
    </div>
  )
}
