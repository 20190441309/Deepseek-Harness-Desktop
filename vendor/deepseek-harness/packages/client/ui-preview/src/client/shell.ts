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

/** Injected preview callbacks. */
export interface PreviewShellInjected {
  previewAvailable: boolean
  previewOpen: (input: { url: string; bounds?: PreviewBounds }) => Promise<PreviewResult>
  previewNavigate: (id: string, url: string) => Promise<PreviewResult>
  previewResize: (id: string, bounds: PreviewBounds) => Promise<void>
  previewHide: (id: string) => Promise<void>
  previewShow: (id: string, bounds?: PreviewBounds) => Promise<void>
  previewClose: (id: string) => Promise<void>
}

interface PreviewShell {
  previewOpen?: PreviewShellInjected['previewOpen']
  previewNavigate?: PreviewShellInjected['previewNavigate']
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
  const shell = typeof window === 'undefined'
    ? undefined
    : (window as Window & { shell?: PreviewShell }).shell
  return {
    previewAvailable: typeof shell?.previewOpen === 'function',
    previewOpen: input => shell?.previewOpen?.(input) ?? Promise.resolve(missing()),
    previewNavigate: (id, url) => shell?.previewNavigate?.(id, url) ?? Promise.resolve(missing()),
    previewResize: (id, bounds) => shell?.previewResize?.(id, bounds) ?? Promise.resolve(),
    previewHide: id => shell?.previewHide?.(id) ?? Promise.resolve(),
    previewShow: (id, bounds) => shell?.previewShow?.(id, bounds) ?? Promise.resolve(),
    previewClose: id => shell?.previewClose?.(id) ?? Promise.resolve(),
  }
}
