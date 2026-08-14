/** Registers the shared terminal drawer and the right-panel Terminal surface. */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import { TerminalDrawer } from './TerminalDrawer.tsx'
import { TerminalSurface } from './TerminalSurface.tsx'
import { en, NS, zh, type TerminalKey } from './locales.ts'
import { bindPtyListeners } from './pty-bridge.ts'
import { readPtyShell, type TerminalShellInjected } from './shell.ts'
import { createTerminalSessionStore } from './stores.ts'

export type { TerminalDrawerProps } from './TerminalDrawer.tsx'
export type { TerminalSurfaceProps } from './TerminalSurface.tsx'
export type { TerminalKey } from './locales.ts'
export type { TerminalShellInjected } from './shell.ts'
export { createTerminalSessionStore, MAX_TERMINALS_PER_GROUP } from './stores.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** User-terminal drawer and surface copy. */
    terminal: TerminalKey
  }
  interface SlotMap {
    /**
     * Right-panel Terminal occupant. Declared as a child by the surfaces
     * shell (Task 6); this plugin injects so it attaches when that slot exists.
     */
    'surfaces.terminal': { kind: 'single'; scope: 'session-maybe'; owner: Record<string, never> }
  }
}

/** Services required by the user-terminal plugin. */
export const inject = ['slots', 'layout', 'locale']

function layoutFace(ctx: ClientContext): Pick<TerminalShellInjected, 'toggleTerminalDrawer' | 'setTerminalDrawer'> {
  return {
    toggleTerminalDrawer: () => { ctx.layout.toggleTerminalDrawer() },
    setTerminalDrawer: px => { ctx.layout.setTerminalDrawer(px) },
  }
}

/**
 * Register dictionaries and inject both terminal shells onto one store handle.
 * @param ctx - Client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-user-terminal: dictionaries')
  const store = createTerminalSessionStore()
  ctx.effect(() => bindPtyListeners(store, readPtyShell()), 'ui-user-terminal: pty bridge')
  const injected = (): TerminalShellInjected => ({
    ...readPtyShell(),
    ...layoutFace(ctx),
  })

  ctx.slots.inject('shell.terminalDrawer', () => ctx.slots.register({
    name: 'shell.terminalDrawer',
    store,
    locale: NS,
    inject: injected,
  }, TerminalDrawer))

  ctx.slots.inject('surfaces.terminal', () => ctx.slots.register({
    name: 'surfaces.terminal',
    store,
    locale: NS,
    inject: injected,
  }, TerminalSurface))
}
