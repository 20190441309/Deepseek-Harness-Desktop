/** Registers the titlebar Git split button into the layout-owned trailing cluster. */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type { GitActionsInjected } from './GitActionsControl.tsx'
import { GitActionsControl } from './GitActionsControl.tsx'
import type { BranchRef } from './branches.ts'
import type { GitResult, VcsStatus } from './git-logic.ts'
import { en, NS, zh, type GitKey } from './locales.ts'

export type { GitActionsInjected, GitActionsProps } from './GitActionsControl.tsx'
export type { GitKey } from './locales.ts'
export type { GitResult, VcsStatus } from './git-logic.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Titlebar Git action copy. */
    git: GitKey
  }
}

/** Desktop git methods the Electron preload exposes on `window.shell`. */
interface GitShell {
  gitStatus?: (cwd: string) => Promise<VcsStatus | null>
  gitInit?: (cwd: string) => Promise<GitResult>
  gitCommit?: (cwd: string, message: string) => Promise<GitResult>
  gitPush?: (cwd: string) => Promise<GitResult>
  gitPull?: (cwd: string) => Promise<GitResult>
  gitCreateChangeRequest?: (cwd: string, input: { title: string; body: string }) => Promise<GitResult>
  gitBranchList?: (cwd: string) => Promise<{ ok: boolean; message?: string; branches?: import('./branches.ts').BranchRef[] }>
  gitSwitchBranch?: (cwd: string, ref: string) => Promise<GitResult & { refName?: string }>
  gitCreateBranch?: (cwd: string, name: string) => Promise<GitResult & { refName?: string }>
  openExternal?: (url: string) => Promise<boolean>
}

function noBranchList(): Promise<{ ok: boolean; message: string; branches: BranchRef[] }> {
  return Promise.resolve({ ok: false, message: unavailable().message ?? 'Git status is unavailable.', branches: [] })
}

function unavailable(): GitResult {
  return { ok: false, message: 'Git status is unavailable.' }
}

/**
 * Bind desktop git IPC when `window.shell` is present.
 * @returns injected git callbacks; each call no-ops outside the desktop app.
 */
function readGitShell(): GitActionsInjected {
  /* v8 ignore next -- browser-only module; Node coverage never sees a missing window. */
  const shell = typeof window === 'undefined'
    ? undefined
    : (window as Window & { shell?: GitShell }).shell
  return {
    gitStatus: cwd => shell?.gitStatus?.(cwd) ?? Promise.resolve(null),
    gitInit: cwd => shell?.gitInit?.(cwd) ?? Promise.resolve(unavailable()),
    gitCommit: (cwd, message) => shell?.gitCommit?.(cwd, message) ?? Promise.resolve(unavailable()),
    gitPush: cwd => shell?.gitPush?.(cwd) ?? Promise.resolve(unavailable()),
    gitPull: cwd => shell?.gitPull?.(cwd) ?? Promise.resolve(unavailable()),
    gitCreateChangeRequest: (cwd, input) =>
      shell?.gitCreateChangeRequest?.(cwd, input) ?? Promise.resolve(unavailable()),
    gitBranchList: cwd => shell?.gitBranchList?.(cwd) ?? noBranchList(),
    gitSwitchBranch: (cwd, ref) => shell?.gitSwitchBranch?.(cwd, ref) ?? Promise.resolve(unavailable()),
    gitCreateBranch: (cwd, name) => shell?.gitCreateBranch?.(cwd, name) ?? Promise.resolve(unavailable()),
    openExternal: url => shell?.openExternal?.(url) ?? Promise.resolve(false),
  }
}

/** Services required by the git plugin. */
export const inject = ['slots', 'locale']

/**
 * Register the dictionaries and inject the Git split button at order 20.
 * @param ctx - Client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-git: dictionaries')

  ctx.slots.inject('shell.titlebar.trailing', () => ctx.slots.register({
    name: 'shell.titlebar.trailing',
    id: 'git-actions',
    order: 20,
    locale: NS,
    inject: (): GitActionsInjected => readGitShell(),
  }, GitActionsControl))
}
