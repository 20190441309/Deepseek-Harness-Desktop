/** Desktop workspace listing the Electron preload exposes on `window.shell`. */

/** One directory child. */
export interface DirEntry {
  name: string
  kind: 'file' | 'directory'
}

/** listDir IPC result. */
export interface ListDirResult {
  ok: boolean
  message?: string
  entries?: DirEntry[]
}

/** readFile IPC result. */
export interface ReadFileResult {
  ok: boolean
  message?: string
  text?: string
  binary?: boolean
  truncated?: boolean
}

/** readFileMedia IPC result for image bytes. */
export interface ReadFileMediaResult {
  ok: boolean
  message?: string
  mime?: string
  base64?: string
  truncated?: boolean
}

/** Injected workspace listing callbacks. */
export interface FilesShellInjected {
  listDir: (cwd: string, relativePath: string) => Promise<ListDirResult>
  readFile: (cwd: string, relativePath: string) => Promise<ReadFileResult>
  readFileMedia: (cwd: string, relativePath: string) => Promise<ReadFileMediaResult>
  mentionFile: (sessionId: string, relativePath: string) => void
}

interface FilesShell {
  listDir?: (cwd: string, relativePath?: string) => Promise<ListDirResult>
  readFile?: (cwd: string, relativePath: string) => Promise<ReadFileResult>
  readFileMedia?: (cwd: string, relativePath: string) => Promise<ReadFileMediaResult>
}

function missingList(): ListDirResult {
  return { ok: false, message: 'Workspace listing is unavailable.' }
}

function missingRead(): ReadFileResult {
  return { ok: false, message: 'Workspace listing is unavailable.' }
}

function missingMedia(): ReadFileMediaResult {
  return { ok: false, message: 'Workspace listing is unavailable.' }
}

/**
 * Bind desktop listing IPC when `window.shell` is present.
 * @returns injected list/read callbacks; each call no-ops outside the desktop app.
 */
export function readFilesShell(): Omit<FilesShellInjected, 'mentionFile'> {
  /* v8 ignore next -- browser-only module; Node coverage never sees a missing window. */
  const shell = typeof window === 'undefined'
    ? undefined
    : (window as Window & { shell?: FilesShell }).shell
  return {
    listDir: (cwd, relativePath) => shell?.listDir?.(cwd, relativePath) ?? Promise.resolve(missingList()),
    readFile: (cwd, relativePath) => shell?.readFile?.(cwd, relativePath) ?? Promise.resolve(missingRead()),
    readFileMedia: (cwd, relativePath) => shell?.readFileMedia?.(cwd, relativePath) ?? Promise.resolve(missingMedia()),
  }
}
