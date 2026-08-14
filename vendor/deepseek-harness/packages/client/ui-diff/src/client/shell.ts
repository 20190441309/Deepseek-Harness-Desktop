/** Desktop git diff the Electron preload exposes on `window.shell`. */

/** One unified-diff line. */
export interface DiffLine {
  kind: 'context' | 'add' | 'del'
  text: string
}

/** One hunk inside a changed file. */
export interface DiffHunk {
  header: string
  lines: DiffLine[]
}

/** One changed path in the working tree. */
export interface DiffFile {
  path: string
  status: 'added' | 'modified' | 'deleted' | 'renamed'
  oldPath?: string
  hunks: DiffHunk[]
}

/** gitDiff IPC result; null when the cwd is not a git repository. */
export interface GitDiffResult {
  files: DiffFile[]
  truncated?: boolean
}

/** Injected git probes. */
export interface DiffShellInjected {
  gitStatus: (cwd: string) => Promise<unknown | null>
  gitDiff: (cwd: string) => Promise<GitDiffResult | null>
}

interface DiffShell {
  gitStatus?: (cwd: string) => Promise<unknown | null>
  gitDiff?: (cwd: string) => Promise<GitDiffResult | null>
}

/**
 * Bind desktop git IPC when `window.shell` is present.
 * @returns injected git callbacks; each call resolves null outside the desktop app.
 */
export function readDiffShell(): DiffShellInjected {
  /* v8 ignore next -- browser-only module; Node coverage never sees a missing window. */
  const shell = typeof window === 'undefined'
    ? undefined
    : (window as Window & { shell?: DiffShell }).shell
  return {
    gitStatus: cwd => shell?.gitStatus?.(cwd) ?? Promise.resolve(null),
    gitDiff: cwd => shell?.gitDiff?.(cwd) ?? Promise.resolve(null),
  }
}
