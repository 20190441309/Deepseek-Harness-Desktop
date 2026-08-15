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

/** One phone or browser that has completed pairing. */
export type RemoteDevice = {
  deviceId: string
  createdAt?: number
  label?: string
}

/** Remote-access snapshot returned by the desktop sidecar. */
export type RemoteAccessStatus = {
  enabled?: boolean
  connected?: boolean
  pairingUrl?: string | null
  pairingExpiresAtMs?: number | null
  qrDataUrl?: string | null
  devices?: RemoteDevice[]
  relayEndpoint?: string
}

/** Public desktop config fields the settings UI reads or writes. */
export type DesktopConfig = {
  appVersion?: string
  repoUrl?: string
  releasesUrl?: string
  closeToTray?: boolean
}

/** The preload-exposed desktop API surface used by the settings UI. */
export type DesktopShell = {
  getConfig?: () => Promise<DesktopConfig>
  saveConfig?: (patch: { closeToTray?: boolean }) => Promise<DesktopConfig>
  checkUpdate?: () => Promise<UpdateInfo>
  installUpdate?: () => Promise<UpdateInfo>
  onUpdateProgress?: (handler: (payload: ProgressPayload) => void) => () => void
  getRemoteAccess?: () => Promise<RemoteAccessStatus>
  setRemoteEnabled?: (enabled: boolean) => Promise<RemoteAccessStatus>
  refreshRemoteOffer?: () => Promise<RemoteAccessStatus>
  revokeRemoteDevice?: (deviceId: string) => Promise<RemoteAccessStatus>
}

/**
 * Read the desktop bridge if present.
 * @returns the preload API, or null in a plain browser.
 */
export function desktopShell(): DesktopShell | null {
  /* v8 ignore next -- the browser bundle always has window */
  if (typeof window === 'undefined') return null
  const api = (window as Window & { shell?: DesktopShell }).shell
  return api && typeof api === 'object' ? api : null
}

/**
 * Whether the desktop bridge can persist the close-window preference.
 * @param shell - preload API, or the live bridge when omitted.
 * @returns true only when both getConfig and saveConfig exist.
 */
export function canPersistCloseBehavior(shell: DesktopShell | null = desktopShell()): boolean {
  return Boolean(shell?.getConfig && shell?.saveConfig)
}

/**
 * Whether the desktop bridge can show and persist remote-access pairing.
 * @param shell - preload API, or the live bridge when omitted.
 * @returns true only when status, enable, and revoke exist.
 */
export function canPersistRemoteAccess(shell: DesktopShell | null = desktopShell()): boolean {
  return Boolean(shell?.getRemoteAccess && shell?.setRemoteEnabled && shell?.revokeRemoteDevice)
}
