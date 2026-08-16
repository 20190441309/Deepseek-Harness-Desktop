import { useEffect, type ReactNode } from 'react'
import type {
  InjectFace, PropsLocale, PropsRenderSlots, PropsRuntime, PropsStore,
} from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import { EmptyState } from './EmptyState.tsx'
import { NS } from './locales.ts'
import type { createSurfacesStore, OpenableKind, Surface } from './stores.ts'
import { persistSession, cancelPersist, writeSession } from './persist.ts'
import { sessionSurfaces } from './stores.ts'
import { SurfaceTabs } from './SurfaceTabs.tsx'
import css from './SurfacesRoot.module.css'

/** Layout write and probes injected so cards can open the column and disable Browser. */
export interface SurfacesRootInjected {
  openSurfaces: () => void
  /** True when desktop `window.shell.previewOpen` exists. */
  previewAvailable: boolean
  gitStatus: (cwd: string) => Promise<unknown>
}

export type SurfacesRootProps =
  & PropsRuntime<'surfaces'>
  & PropsStore<ReturnType<typeof createSurfacesStore>>
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
      return renderSlot('surfaces.diff', { openFile })
    case 'agents':
      return renderSlot('surfaces.agents', {})
    /* v8 ignore start -- Surface is a closed union; the never arm is uninhabited. */
    default: {
      const _never: never = surface
      return _never
    }
    /* v8 ignore stop */
  }
}

function currentCwd(useSessions: SurfacesRootProps['useSessions']): string | undefined {
  return useSessions((s) => {
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
  return (
    <SurfacesBody
      {...props}
      useStore={props.useStore}
      actions={props.actions}
      diffAvailable={cwd !== undefined}
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
  previewAvailable,
  t,
  diffAvailable,
}: SurfacesBodyProps): ReactNode {
  const key = sessionId ?? ''
  const bucket = useStore(state => sessionSurfaces(state, key))
  useEffect(() => {
    if (key.length === 0) return
    persistSession(key, bucket)
    return () => {
      cancelPersist(key)
      writeSession(key, bucket)
    }
  }, [key, bucket])
  const open = (kind: OpenableKind): void => {
    actions.open(key, kind)
    openSurfaces()
  }
  const openFile = (relativePath: string): void => {
    actions.openFile(key, relativePath)
    openSurfaces()
  }
  const active = bucket.surfaces.find(surface => surface.id === bucket.activeId)
  /* v8 ignore next -- actions keep activeId on an open surface. */
  const occupant = active === undefined ? null : renderOccupant(active, renderSlot, openFile)

  return (
    <div className={css.root} data-surfaces-root>
      {bucket.surfaces.length === 0 ? (
        <EmptyState
          onOpen={open}
          t={t}
          browserAvailable={previewAvailable}
          diffAvailable={diffAvailable}
        />
      ) : (
        <>
          <SurfaceTabs
            surfaces={bucket.surfaces}
            activeId={bucket.activeId}
            onActivate={(id) => { actions.activate(key, id) }}
            onClose={(id) => { actions.close(key, id) }}
            onCloseOthers={(id) => { actions.closeOthers(key, id) }}
            onCloseToRight={(id) => { actions.closeToRight(key, id) }}
            onCloseAll={() => { actions.closeAll(key) }}
            onOpenKind={open}
            openable={{
              preview: previewAvailable && !bucket.surfaces.some(surface => surface.kind === 'preview'),
              terminal: !bucket.surfaces.some(surface => surface.kind === 'terminal'),
              files: !bucket.surfaces.some(surface => surface.kind === 'files'),
              diff: diffAvailable && !bucket.surfaces.some(surface => surface.kind === 'diff'),
              agents: !bucket.surfaces.some(surface => surface.kind === 'agents'),
            }}
            t={t}
          />
          <div className={css.body} data-surfaces-occupant>
            {occupant}
          </div>
        </>
      )}
    </div>
  )
}
