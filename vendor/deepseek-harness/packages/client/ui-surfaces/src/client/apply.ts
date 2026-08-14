/** Registers the right-panel surfaces shell into the layout-owned column. */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import { en, NS, zh, type SurfacesKey } from './locales.ts'
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
     * Browser / preview occupant. Later ui-preview injects here.
     */
    'surfaces.browser': { kind: 'single'; scope: 'session-maybe'; owner: Record<string, never> }
    /**
     * Terminal occupant. ui-user-terminal already injects here; kind and
     * scope must stay `single` + `session-maybe` so that inject attaches.
     */
    'surfaces.terminal': { kind: 'single'; scope: 'session-maybe'; owner: Record<string, never> }
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
    'surfaces.diff': { kind: 'single'; scope: 'session-maybe'; owner: Record<string, never> }
    /**
     * Running-agents occupant. Later ui-agents-panel injects here.
     */
    'surfaces.agents': { kind: 'single'; scope: 'session-maybe'; owner: Record<string, never> }
  }
}

interface GitShell {
  gitStatus?: (cwd: string) => Promise<unknown | null>
}

/**
 * Bind desktop gitStatus when `window.shell` is present.
 * @returns a probe that resolves null outside the desktop app or when git is missing.
 */
function readGitStatus(): SurfacesRootInjected['gitStatus'] {
  const shell = typeof window === 'undefined'
    ? undefined
    : (window as Window & { shell?: GitShell }).shell
  return cwd => shell?.gitStatus?.(cwd) ?? Promise.resolve(null)
}

/** Services required by the surfaces plugin. */
export const inject = ['slots', 'layout', 'locale']

/**
 * Register dictionaries and occupy the layout `surfaces` column.
 * @param ctx - Client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-surfaces: dictionaries')

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
    inject: (): SurfacesRootInjected => ({
      openSurfaces: () => { ctx.layout.openSurfaces() },
      gitStatus: readGitStatus(),
    }),
  }, SurfacesRoot))
}
