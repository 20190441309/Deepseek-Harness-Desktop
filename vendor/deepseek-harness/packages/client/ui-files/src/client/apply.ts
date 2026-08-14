/** Registers the Files tree and single-file preview into surfaces slots. */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { FilePreview } from './FilePreview.tsx'
import { FilesPanel } from './FilesPanel.tsx'
import { en, NS, zh, type FilesKey } from './locales.ts'
import { readFilesShell, type FilesShellInjected } from './shell.ts'

export type { FilesPanelProps } from './FilesPanel.tsx'
export type { FilePreviewProps } from './FilePreview.tsx'
export type { FilesKey } from './locales.ts'
export type { DirEntry, FilesShellInjected, ListDirResult, ReadFileResult } from './shell.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Files surface copy. */
    files: FilesKey
  }
  interface SlotMap {
    /**
     * Workspace tree occupant. Declared by the surfaces shell; this plugin
     * injects so it attaches when that slot exists.
     */
    'surfaces.files': {
      kind: 'single'
      scope: 'session-maybe'
      owner: { openFile: (relativePath: string) => void }
    }
    /**
     * Single-file preview occupant. Declared by the surfaces shell.
     */
    'surfaces.file': {
      kind: 'single'
      scope: 'session-maybe'
      owner: { relativePath: string }
    }
  }
}

/** Services required by the files plugin. */
export const inject = ['slots', 'locale']

/**
 * Register dictionaries and inject the tree and preview occupants.
 * @param ctx - Client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-files: dictionaries')
  const injected = (): FilesShellInjected => readFilesShell()

  ctx.slots.inject('surfaces.files', () => ctx.slots.register({
    name: 'surfaces.files',
    locale: NS,
    inject: injected,
  }, FilesPanel))

  ctx.slots.inject('surfaces.file', () => ctx.slots.register({
    name: 'surfaces.file',
    locale: NS,
    inject: injected,
  }, FilePreview))
}
