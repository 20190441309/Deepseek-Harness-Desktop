import { useEffect, useState, type ReactNode } from 'react'
import type {
  InjectFace, PropsLocale, PropsRenderSlots, PropsRuntime, PropsStore,
} from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import { EmptyState } from './EmptyState.tsx'
import { NS } from './locales.ts'
import type { createSurfacesStore, OpenableKind, Surface } from './stores.ts'
import { sessionSurfaces } from './stores.ts'
import { SurfaceTabs } from './SurfaceTabs.tsx'
import css from './SurfacesRoot.module.css'

/** Layout write and git probe injected so cards can open the column and disable Diff. */
export interface SurfacesRootInjected {
  openSurfaces: () => void
  gitStatus: (cwd: string) => Promise<unknown | null>
}

export type SurfacesRootProps =
  & PropsRuntime<'surfaces'>
  & Partial<PropsStore<ReturnType<typeof createSurfacesStore>>>
  & PropsRenderSlots<'surfaces.browser' | 'surfaces.terminal' | 'surfaces.files' | 'surfaces.file' | 'surfaces.diff' | 'surfaces.agents'>
  & PropsLocale<typeof NS>
  & InjectFace<SurfacesRootInjected>

function renderOccupant(
  surface: Surface,
  renderSlot: SurfacesRootProps['renderSlot'],
  openFile: (relativePath: string) => void,
): ReactNode {
  switch (surface.kind) {
    case 'preview':
      return renderSlot('surfaces.browser', {})
    case 'terminal':
      return renderSlot('surfaces.terminal', {})
    case 'files':
      return renderSlot('surfaces.files', { openFile })
    case 'file':
      return renderSlot('surfaces.file', { relativePath: surface.relativePath })
    case 'diff':
      return renderSlot('surfaces.diff', {})
    case 'agents':
      return renderSlot('surfaces.agents', {})
    default: {
      const _never: never = surface
      return _never
    }
  }
}

function currentCwd(useSessions: SurfacesRootProps['useSessions']): string | undefined {
  return useSessions(s => {
    const id = s.current
    const next = id === undefined ? undefined : s.byId[id]?.cwd
    return next ? next : undefined
  })
}

/**
 * Occupant of the layout `surfaces` column: empty five-card grid, or tabs
 * plus the active occupant slot. Titlebar toggle only writes layout width.
 * @param props - session-maybe seats, the surfaces store, child slots, and copy.
 * @returns the right-panel shell.
 */
export function SurfacesRoot(props: SurfacesRootProps): ReactNode {
  const cwd = currentCwd(props.useSessions)
  const [diffAvailable, setDiffAvailable] = useState(false)
  useEffect(() => {
    if (cwd === undefined) {
      setDiffAvailable(false)
      return
    }
    let cancelled = false
    void props.gitStatus(cwd).then(status => {
      if (!cancelled) setDiffAvailable(status !== null)
    })
    return () => { cancelled = true }
  }, [cwd, props.gitStatus])

  if (props.useStore === undefined || props.actions === undefined) {
    return (
      <div className={css.root} data-surfaces-root>
        <EmptyState onOpen={() => { props.openSurfaces() }} t={props.t} diffAvailable={diffAvailable} />
      </div>
    )
  }
  return (
    <SurfacesBody
      {...props}
      useStore={props.useStore}
      actions={props.actions}
      diffAvailable={diffAvailable}
    />
  )
}

type SurfacesBodyProps = SurfacesRootProps & PropsStore<ReturnType<typeof createSurfacesStore>> & {
  diffAvailable: boolean
}

function SurfacesBody({
  sessionId,
  useStore,
  actions,
  renderSlot,
  openSurfaces,
  t,
  diffAvailable,
}: SurfacesBodyProps): ReactNode {
  const key = sessionId ?? ''
  const bucket = useStore(state => sessionSurfaces(state, key))
  const open = (kind: OpenableKind): void => {
    actions.open(key, kind)
    openSurfaces()
  }
  const openFile = (relativePath: string): void => {
    actions.openFile(key, relativePath)
    openSurfaces()
  }
  const active = bucket.surfaces.find(surface => surface.id === bucket.activeId)

  return (
    <div className={css.root} data-surfaces-root>
      {bucket.surfaces.length === 0 ? (
        <EmptyState onOpen={open} t={t} diffAvailable={diffAvailable} />
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
            {active === undefined ? null : renderOccupant(active, renderSlot, openFile)}
          </div>
        </>
      )}
    </div>
  )
}
