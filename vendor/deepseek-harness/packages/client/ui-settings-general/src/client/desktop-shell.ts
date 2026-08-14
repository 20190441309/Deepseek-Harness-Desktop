/**
 * Desktop shell bridge: the `window.shell` API the Electron preload exposes.
 * Absent outside the desktop app, so every consumer branches on `desktopShell()`.
 */

/** Update snapshot returned by the shell's check/install calls. */
export type UpdateInfo = {
  status?: string
  current?: string
  latest?: string
  htmlUrl?: string
  repoUrl?: string
  releasesUrl?: string
  assetName?: string
  assetUrl?: string
  message?: string
  launched?: boolean
  openedPage?: boolean
}

/** Download/install progress pushed by the shell during installUpdate. */
export type ProgressPayload = {
  phase?: string
  percent?: number
}

/** The preload-exposed desktop API surface used by the settings UI. */
export type DesktopShell = {
  getConfig?: () => Promise<{ appVersion?: string; repoUrl?: string; releasesUrl?: string }>
  checkUpdate?: () => Promise<UpdateInfo>
  installUpdate?: () => Promise<UpdateInfo>
  onUpdateProgress?: (handler: (payload: ProgressPayload) => void) => () => void
}

/**
 * Read the desktop bridge if present.
 * @returns the preload API, or null in a plain browser.
 */
export function desktopShell(): DesktopShell | null {
  if (typeof window === 'undefined') return null
  const api = (window as Window & { shell?: DesktopShell }).shell
  return api && typeof api === 'object' ? api : null
}
