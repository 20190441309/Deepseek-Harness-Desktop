/** Registers the Files tree and single-file preview into surfaces slots. */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-surfaces/client'
import { appendToDraft } from './draft.ts'
import { FilePreview } from './FilePreview.tsx'
import { FilesPanel } from './FilesPanel.tsx'
import { en, NS, zh, type FilesKey } from './locales.ts'
import { readFilesShell, type FilesShellInjected } from './shell.ts'

export type { FilesPanelProps } from './FilesPanel.tsx'
export type { FilePreviewProps } from './FilePreview.tsx'
export type { FilesKey } from './locales.ts'
export type { DirEntry, FilesShellInjected, ListDirResult, ReadFileMediaResult, ReadFileResult, WriteFileResult } from './shell.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Files surface copy. */
    files: FilesKey
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
  const injected = (): FilesShellInjected => ({
    ...readFilesShell(),
    mentionFile: (sessionId, relativePath) => {
      appendToDraft(ctx, sessionId, `\`@${relativePath}\``)
    },
  })

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
