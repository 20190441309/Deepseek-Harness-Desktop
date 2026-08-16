/** Wrap `workspaces.openPath` so desktop file opens land in surfaces. */

/** Minimal workspaces face the interceptor replaces. */
export interface OpenPathService {
  openPath(path: string): Promise<void>
}

/** Live facts the interceptor reads on each open. */
export interface OpenPathInterceptDeps {
  /** False outside the desktop app (no `window.shell.listDir`). */
  takeoverEnabled(): boolean
  /** Current session id, or undefined when the home is blank. */
  currentSessionId(): string | undefined
  /**
   * Open `path` in the surfaces column.
   * @returns false to fall through to the original `openPath`.
   */
  openInSurfaces(path: string, sessionId: string): boolean
}

/**
 * Replace `workspaces.openPath` with a wrapper that takes over on desktop
 * when a current session exists and `openInSurfaces` accepts the path.
 * The disposer writes back the same function reference that was installed
 * when wrapping, so later wrappers can unwind in any order.
 * @param workspaces - the live workspaces service object.
 * @param deps - takeover predicates and the surfaces writer.
 * @returns a disposer that restores `openPath` when this wrapper is still current.
 */
export function wrapOpenPath(workspaces: OpenPathService, deps: OpenPathInterceptDeps): () => void {
  // oxlint-disable-next-line typescript/unbound-method -- identity-preserving reference required by the wrap/restore contract
  const previous = workspaces.openPath
  const wrapped = async function openPathIntercept(path: string): Promise<void> {
    if (!deps.takeoverEnabled()) return previous.call(workspaces, path)
    const sessionId = deps.currentSessionId()
    if (sessionId === undefined) return previous.call(workspaces, path)
    if (!deps.openInSurfaces(path, sessionId)) return previous.call(workspaces, path)
  }
  workspaces.openPath = wrapped
  return () => {
    if (workspaces.openPath === wrapped) workspaces.openPath = previous
  }
}
