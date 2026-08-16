/**
 * Desktop shell bridge used by the Remote popup.
 * Absent outside the desktop app, so registration branches on it.
 */

/** One LAN address the desktop gateway currently advertises. */
export type RemoteUrl = {
  address: string
  url: string
  pairingUrl: string
}

/** A device bound to this desktop after scanning the pairing QR. */
export type RemoteDevice = {
  id: string
  name: string
  createdAt?: string
  lastSeenAt?: string
  online?: boolean
  /** Last four characters of `id`, for telling two same-named devices apart. */
  shortId?: string
  /** OS / model / browser parsed from the stored user-agent; never the raw UA. */
  detail?: string
}

/** Snapshot returned by `window.shell.getRemote`. */
export type RemoteSnapshot = {
  enabled?: boolean
  listening?: boolean
  port?: number
  token?: string
  mode?: 'lan' | 'relay'
  relayUrl?: string
  relayConnected?: boolean
  relayError?: string
  error?: string
  urls?: RemoteUrl[]
  devices?: RemoteDevice[]
}

/** Patch accepted by `window.shell.saveRemote`. */
export type RemotePatch = {
  remoteEnabled?: boolean
  remotePort?: number
  remoteMode?: 'lan' | 'relay'
  remoteRelayUrl?: string
}

/** The preload-exposed desktop API used by the Remote popup. */
export type DesktopShell = {
  getRemote?: () => Promise<RemoteSnapshot | null>
  saveRemote?: (patch: RemotePatch) => Promise<RemoteSnapshot | null>
  rotateRemoteToken?: () => Promise<RemoteSnapshot | null>
  unbindRemoteDevice?: (id: string) => Promise<RemoteSnapshot | null>
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

/** Desktop shell object that actually implements the Remote IPC methods. */
type RemoteDesktopApi = Required<Pick<DesktopShell, 'getRemote' | 'saveRemote' | 'rotateRemoteToken' | 'unbindRemoteDevice'>>

/**
 * Whether the preload object can drive the Remote popup.
 * @param shell - `window.shell`, or null in a plain browser.
 * @returns true only when get/save/rotate/unbind are all functions.
 */
export function hasRemoteApi(shell: DesktopShell | null): shell is RemoteDesktopApi {
  return Boolean(
    shell?.getRemote
    && shell.saveRemote
    && shell.rotateRemoteToken
    && shell.unbindRemoteDevice,
  )
}
