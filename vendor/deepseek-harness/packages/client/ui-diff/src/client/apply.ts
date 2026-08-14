/** Registers the Diff occupant into surfaces.diff. */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { DiffPanel } from './DiffPanel.tsx'
import { en, NS, zh, type DiffKey } from './locales.ts'
import { readDiffShell, type DiffShellInjected } from './shell.ts'

export type { DiffPanelProps } from './DiffPanel.tsx'
export type { DiffKey } from './locales.ts'
export type { DiffFile, DiffHunk, DiffLine, DiffShellInjected, GitDiffResult } from './shell.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Diff surface copy. */
    diff: DiffKey
  }
  interface SlotMap {
    /**
     * Git diff occupant. Declared by the surfaces shell; this plugin injects
     * so it attaches when that slot exists.
     */
    'surfaces.diff': { kind: 'single'; scope: 'session-maybe'; owner: Record<string, never> }
  }
}

/** Services required by the diff plugin. */
export const inject = ['slots', 'locale']

/**
 * Register dictionaries and inject the Diff occupant.
 * @param ctx - Client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-diff: dictionaries')

  ctx.slots.inject('surfaces.diff', () => ctx.slots.register({
    name: 'surfaces.diff',
    locale: NS,
    inject: (): DiffShellInjected => readDiffShell(),
  }, DiffPanel))
}
