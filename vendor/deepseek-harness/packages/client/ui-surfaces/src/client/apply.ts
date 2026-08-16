/** Registers the right-panel surfaces shell into the layout-owned column. */
import type { ClientContext, SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import { en, NS, zh, type SurfacesKey } from './locales.ts'
import { wrapOpenPath } from './openpath-intercept.ts'
import { relativeTo } from './paths.ts'
import { createSurfacesStore } from './stores.ts'
import type { SurfacesRootInjected } from './SurfacesRoot.tsx'
import { SurfacesRoot } from './SurfacesRoot.tsx'

export type { SurfacesRootInjected, SurfacesRootProps } from './SurfacesRoot.tsx'
export type { SurfacesKey } from './locales.ts'
export type { OpenableKind, Surface, SurfaceKind, SurfacesState } from './stores.ts'
export { createSurfacesStore } from './stores.ts'

/** Owner props the Files occupant receives so it can open a file surface. */
export interface FilesOwnerProps {
  openFile: (relativePath: string) => void
}

/** Owner props the single-file occupant receives. */
export interface FileOwnerProps {
  relativePath: string
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Right-panel surfaces copy. */
    surfaces: SurfacesKey
  }
  interface SlotMap {
    /**
     * Browser / preview occupant. ui-preview injects here.
     */
    'surfaces.browser': { kind: 'single'; scope: 'session-maybe'; owner: {} }
    /**
     * Terminal occupant. ui-user-terminal already injects here; kind and
     * scope must stay `single` + `session-maybe` so that inject attaches.
     */
    'surfaces.terminal': { kind: 'single'; scope: 'session-maybe'; owner: {} }
    /**
     * Workspace files occupant. ui-files injects here.
     */
    'surfaces.files': { kind: 'single'; scope: 'session-maybe'; owner: FilesOwnerProps }
    /**
     * Single-file preview occupant. ui-files injects here.
     */
    'surfaces.file': { kind: 'single'; scope: 'session-maybe'; owner: FileOwnerProps }
    /**
     * Git diff occupant. ui-diff injects here.
     */
    'surfaces.diff': { kind: 'single'; scope: 'session-maybe'; owner: FilesOwnerProps }
    /**
     * Running-agents occupant. ui-agents-panel injects here.
     */
    'surfaces.agents': { kind: 'single'; scope: 'session-maybe'; owner: {} }
  }
}

interface DesktopShell {
  gitStatus?: (cwd: string) => Promise<unknown>
  previewOpen?: (input: { url: string }) => Promise<unknown>
  listDir?: (cwd: string, relativePath?: string) => Promise<unknown>
}

interface SurfacesStoreActions {
  openFile: (sessionId: string, relativePath: string) => void
}

/**
 * Bind desktop gitStatus when `window.shell` is present.
 * @returns a probe that resolves null outside the desktop app or when git is missing.
 */
function readDesktopShell(): Pick<SurfacesRootInjected, 'gitStatus' | 'previewAvailable'> {
  /* v8 ignore next -- browser-only module; Node coverage never sees a missing window. */
  const shell = typeof window === 'undefined'
    ? undefined
    : (window as Window & { shell?: DesktopShell }).shell
  return {
    previewAvailable: typeof shell?.previewOpen === 'function',
    gitStatus: cwd => shell?.gitStatus?.(cwd) ?? Promise.resolve(null),
  }
}

/**
 * True only in the desktop renderer where workspace listing IPC exists.
 * The web e2e lane must fall through to OS `openPath`.
 * @returns whether `window.shell.listDir` is a function.
 */
export function desktopListingAvailable(): boolean {
  /* v8 ignore next -- browser-only module; Node coverage never sees a missing window. */
  if (typeof window === 'undefined') return false
  const shell = (window as Window & { shell?: DesktopShell }).shell
  return typeof shell?.listDir === 'function'
}

/** Services required by the surfaces plugin. */
export const inject = ['slots', 'layout', 'locale', 'workspaces', 'sessions']

/**
 * Register dictionaries, occupy the layout `surfaces` column, and intercept
 * `workspaces.openPath` into the files surface on desktop.
 * @param ctx - Client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-surfaces: dictionaries')

  const live: { openFile?: SurfacesStoreActions['openFile'] } = {}

  ctx.slots.inject('surfaces', () => ctx.slots.register({
    name: 'surfaces',
    locale: NS,
    store: createSurfacesStore,
    children: {
      'surfaces.browser': { kind: 'single', scope: 'session-maybe' },
      'surfaces.terminal': { kind: 'single', scope: 'session-maybe' },
      'surfaces.files': { kind: 'single', scope: 'session-maybe' },
      'surfaces.file': { kind: 'single', scope: 'session-maybe' },
      'surfaces.diff': { kind: 'single', scope: 'session-maybe' },
      'surfaces.agents': { kind: 'single', scope: 'session-maybe' },
    },
    inject: (_sessionId, actions): SurfacesRootInjected => {
      if (actions !== undefined) {
        live.openFile = (sessionId, relativePath) => { actions.openFile(sessionId, relativePath) }
      }
      return {
        openSurfaces: () => { ctx.layout.openSurfaces() },
        ...readDesktopShell(),
      }
    },
  }, SurfacesRoot))

  ctx.effect(() => wrapOpenPath(ctx.workspaces, {
    takeoverEnabled: desktopListingAvailable,
    currentSessionId: () => ctx.sessions.list.getSnapshot().current,
    openInSurfaces: (path, sessionId) => {
      const cwd = ctx.sessions.list.getSnapshot().byId[sessionId as SessionId]?.cwd
      if (typeof cwd !== 'string' || cwd.length === 0) return false
      const relative = relativeTo(cwd, path)
      if (relative === undefined || relative === '') return false
      if (live.openFile === undefined) return false
      live.openFile(sessionId, relative)
      ctx.layout.openSurfaces()
      return true
    },
  }), 'ui-surfaces: openPath intercept')
}
