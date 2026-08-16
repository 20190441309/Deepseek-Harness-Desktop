/** Desktop preview IPC the Electron preload exposes on `window.shell`. */

/** Guest view rectangle in window content coordinates. */
export interface PreviewBounds {
  x: number
  y: number
  width: number
  height: number
}

/** previewOpen / previewNavigate result. */
export interface PreviewResult {
  ok: boolean
  id?: string
  url?: string
  message?: string
}

/** Navigation / history snapshot for one guest. */
export interface PreviewNavState {
  ok: boolean
  id?: string
  url?: string
  canGoBack?: boolean
  canGoForward?: boolean
  message?: string
}

/** One discovered loopback server. */
export interface DiscoveredServer {
  url: string
  port: number
}

/** Injected preview callbacks. */
export interface PreviewShellInjected {
  previewAvailable: boolean
  previewOpen: (input: { url: string; bounds?: PreviewBounds }) => Promise<PreviewResult>
  previewNavigate: (id: string, url: string) => Promise<PreviewResult>
  previewBack: (id: string) => Promise<PreviewNavState>
  previewForward: (id: string) => Promise<PreviewNavState>
  previewReload: (id: string) => Promise<PreviewNavState>
  previewState: (id: string) => Promise<PreviewNavState>
  onPreviewStateChange: (handler: (state: PreviewNavState) => void) => () => void
  previewOpenDevTools: (id: string) => Promise<{ ok: boolean; id?: string }>
  previewDiscover: () => Promise<DiscoveredServer[]>
  openExternal: (url: string) => Promise<unknown>
  previewResize: (id: string, bounds: PreviewBounds) => Promise<void>
  previewHide: (id: string) => Promise<void>
  previewShow: (id: string, bounds?: PreviewBounds) => Promise<void>
  previewClose: (id: string) => Promise<void>
}

interface PreviewShell {
  previewOpen?: PreviewShellInjected['previewOpen']
  previewNavigate?: PreviewShellInjected['previewNavigate']
  previewBack?: PreviewShellInjected['previewBack']
  previewForward?: PreviewShellInjected['previewForward']
  previewReload?: PreviewShellInjected['previewReload']
  previewState?: PreviewShellInjected['previewState']
  onPreviewStateChange?: PreviewShellInjected['onPreviewStateChange']
  previewOpenDevTools?: PreviewShellInjected['previewOpenDevTools']
  previewDiscover?: PreviewShellInjected['previewDiscover']
  openExternal?: PreviewShellInjected['openExternal']
  previewResize?: PreviewShellInjected['previewResize']
  previewHide?: PreviewShellInjected['previewHide']
  previewShow?: PreviewShellInjected['previewShow']
  previewClose?: PreviewShellInjected['previewClose']
}

function missing(): PreviewResult {
  return { ok: false, message: 'Browser previews are only available in the desktop app.' }
}

/**
 * Bind desktop preview IPC when `window.shell` is present.
 * @returns injected preview callbacks; each call no-ops outside the desktop app.
 */
export function readPreviewShell(): PreviewShellInjected {
  /* v8 ignore next -- browser-only module; Node coverage never sees a missing window. */
  const shell = typeof window === 'undefined'
    ? undefined
    : (window as Window & { shell?: PreviewShell }).shell
  return {
    previewAvailable: typeof shell?.previewOpen === 'function',
    previewOpen: input => shell?.previewOpen?.(input) ?? Promise.resolve(missing()),
    previewNavigate: (id, url) => shell?.previewNavigate?.(id, url) ?? Promise.resolve(missing()),
    previewBack: id => shell?.previewBack?.(id) ?? Promise.resolve(missing()),
    previewForward: id => shell?.previewForward?.(id) ?? Promise.resolve(missing()),
    previewReload: id => shell?.previewReload?.(id) ?? Promise.resolve(missing()),
    previewState: id => shell?.previewState?.(id) ?? Promise.resolve(missing()),
    onPreviewStateChange: handler => (
      typeof shell?.onPreviewStateChange === 'function'
        ? shell.onPreviewStateChange(handler)
        : () => {}
    ),
    previewOpenDevTools: id => shell?.previewOpenDevTools?.(id) ?? Promise.resolve({ ok: false }),
    previewDiscover: () => shell?.previewDiscover?.() ?? Promise.resolve([]),
    openExternal: url => shell?.openExternal?.(url) ?? Promise.resolve(),
    previewResize: (id, bounds) => shell?.previewResize?.(id, bounds) ?? Promise.resolve(),
    previewHide: id => shell?.previewHide?.(id) ?? Promise.resolve(),
    previewShow: (id, bounds) => shell?.previewShow?.(id, bounds) ?? Promise.resolve(),
    previewClose: id => shell?.previewClose?.(id) ?? Promise.resolve(),
  }
}
