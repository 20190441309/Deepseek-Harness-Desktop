/** `@` path source for the shared input-trigger menu. */
import type { InputTriggerSource } from '@deepseek-ai/dsh-client-ui-input-trigger/client'
import { serializeComposerFileLink } from './composerMention.ts'
import { getProjectFilePickerMatches, type ProjectEntry } from './projectFilePicker.ts'
import type { ListDirResult } from './shell.ts'

/** Session list face the path source reads `cwd` from. */
export interface PathTriggerSessions {
  list: {
    getSnapshot(): { byId: Record<string, { cwd?: string; agentPreset?: string } | undefined> }
  }
}

/** Workspace listing used to walk files for `@` path candidates. */
export type PathTriggerListDir = (cwd: string, relativePath: string) => Promise<ListDirResult>

function joinRel(parent: string, name: string): string {
  return parent === '' ? name : `${parent}/${name}`
}

/**
 * Uncapped `listDir` walk of `cwd`, flattened to file entries. Returns [] when
 * the request aborts.
 */
async function walkProjectFiles(
  cwd: string,
  listDir: PathTriggerListDir,
  signal: AbortSignal,
): Promise<ProjectEntry[]> {
  const files: ProjectEntry[] = []
  const walk = async (parent: string): Promise<void> => {
    const result = await listDir(cwd, parent)
    if (signal.aborted || !result.ok) return
    for (const entry of result.entries ?? []) {
      if (signal.aborted) return
      const path = joinRel(parent, entry.name)
      if (entry.kind === 'file') files.push({ kind: 'file', path })
      else await walk(path)
    }
  }
  await walk('')
  return signal.aborted ? [] : files
}

/**
 * Build the `@` path InputTriggerSource over session cwd + `listDir`.
 * @param deps.sessions - session list snapshot that carries cwd.
 * @param deps.listDir - workspace listing (desktop `window.shell` in production).
 * @returns a source that inserts a markdown file link on pick.
 */
export function createPathTriggerSource(deps: {
  sessions: PathTriggerSessions
  listDir: PathTriggerListDir
}): InputTriggerSource {
  return {
    trigger: '@',
    name: 'path',
    order: 1,
    async candidates(session, req) {
      if (req.signal.aborted) return []
      const row = deps.sessions.list.getSnapshot().byId[session.sessionId]
      if (row?.agentPreset === 'dshbot-room') return []
      const cwd = row?.cwd
      if (cwd === undefined || cwd === '') return []
      const entries = await walkProjectFiles(cwd, deps.listDir, req.signal)
      if (req.signal.aborted) return []
      return getProjectFilePickerMatches(entries, req.query).map(match => ({
        name: match.path,
        description: match.name,
      }))
    },
    onPick({ candidate }) {
      return { text: `${serializeComposerFileLink(candidate.name)} ` }
    },
  }
}
