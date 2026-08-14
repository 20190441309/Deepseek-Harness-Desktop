import type { ReactNode } from 'react'
import type {
  InjectFace, PropsLocale, PropsRenderSlots, PropsRuntime, PropsStore,
} from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import { EmptyState } from './EmptyState.tsx'
import { NS } from './locales.ts'
import type { createSurfacesStore, OpenableKind, SurfaceKind } from './stores.ts'
import { sessionSurfaces } from './stores.ts'
import { SurfaceTabs } from './SurfaceTabs.tsx'
import css from './SurfacesRoot.module.css'

/** Layout write injected so a card can open the surfaces column. */
export interface SurfacesRootInjected {
  openSurfaces: () => void
}

export type SurfacesRootProps =
  & PropsRuntime<'surfaces'>
  & Partial<PropsStore<ReturnType<typeof createSurfacesStore>>>
  & PropsRenderSlots<'surfaces.browser' | 'surfaces.terminal' | 'surfaces.files' | 'surfaces.diff' | 'surfaces.agents'>
  & PropsLocale<typeof NS>
  & InjectFace<SurfacesRootInjected>

function occupantSlot(kind: SurfaceKind): 'surfaces.browser' | 'surfaces.terminal' | 'surfaces.files' | 'surfaces.diff' | 'surfaces.agents' {
  switch (kind) {
    case 'preview':
      return 'surfaces.browser'
    case 'terminal':
      return 'surfaces.terminal'
    case 'files':
    case 'file':
      return 'surfaces.files'
    case 'diff':
      return 'surfaces.diff'
    case 'agents':
      return 'surfaces.agents'
    default: {
      const _never: never = kind
      return _never
    }
  }
}

/**
 * Occupant of the layout `surfaces` column: empty five-card grid, or tabs
 * plus the active occupant slot. Titlebar toggle only writes layout width.
 * @param props - session-maybe seats, the surfaces store, child slots, and copy.
 * @returns the right-panel shell.
 */
export function SurfacesRoot(props: SurfacesRootProps): ReactNode {
  if (props.useStore === undefined || props.actions === undefined) {
    return (
      <div className={css.root} data-surfaces-root>
        <EmptyState onOpen={() => { props.openSurfaces() }} t={props.t} />
      </div>
    )
  }
  return <SurfacesBody {...props} useStore={props.useStore} actions={props.actions} />
}

type SurfacesBodyProps = SurfacesRootProps & PropsStore<ReturnType<typeof createSurfacesStore>>

function SurfacesBody({
  sessionId,
  useStore,
  actions,
  renderSlot,
  openSurfaces,
  t,
}: SurfacesBodyProps): ReactNode {
  const key = sessionId ?? ''
  const bucket = useStore(state => sessionSurfaces(state, key))
  const open = (kind: OpenableKind): void => {
    actions.open(key, kind)
    openSurfaces()
  }
  const active = bucket.surfaces.find(surface => surface.id === bucket.activeId)

  return (
    <div className={css.root} data-surfaces-root>
      {bucket.surfaces.length === 0 ? (
        <EmptyState onOpen={open} t={t} />
      ) : (
        <>
          <SurfaceTabs
            surfaces={bucket.surfaces}
            activeId={bucket.activeId}
            onActivate={id => { actions.activate(key, id) }}
            onClose={id => { actions.close(key, id) }}
            t={t}
          />
          <div className={css.body} data-surfaces-occupant>
            {active === undefined ? null : renderSlot(occupantSlot(active.kind), {})}
          </div>
        </>
      )}
    </div>
  )
}
