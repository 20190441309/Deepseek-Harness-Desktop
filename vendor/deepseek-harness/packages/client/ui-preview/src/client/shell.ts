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
  loading?: boolean
  title?: string
  unreachable?: boolean
  zoomFactor?: number
  pictureInPicture?: boolean
  message?: string
}

/** Guest `prefers-color-scheme` override. Empty string in CDP is `'system'`. */
export type PreviewColorScheme = 'system' | 'light' | 'dark'

/** Annotation chrome theme collected from `--dsw-alias-*` tokens. */
export interface PreviewAnnotationTheme {
  colorScheme: 'light' | 'dark'
  radius: string
  background: string
  foreground: string
  popover: string
  popoverForeground: string
  primary: string
  primaryForeground: string
  muted: string
  mutedForeground: string
  accent: string
  accentForeground: string
  border: string
  input: string
  ring: string
  fontSans: string
  fontMono: string
}

/** Cropped screenshot from a completed pick. */
export interface PreviewPickScreenshot {
  dataUrl: string
  width: number
  height: number
  cropRect: { x: number; y: number; width: number; height: number }
}

/** previewPickElement result. */
export interface PreviewPickResult {
  ok: boolean
  message?: string
  annotation?: {
    comment?: string
    elements?: Array<{ element?: { selector?: string } }>
  }
  screenshot?: PreviewPickScreenshot
}

/** JPEG frame from the shared PiP/recording capture pump. */
export interface PreviewRecordingFrame {
  id: string
  data: string
  width: number
  height: number
}

/** Host MediaRecorder payload saved under userData/preview-recordings. */
export interface PreviewRecordingSaveInput {
  mimeType: string
  data: ArrayBuffer
}

/** automationClick target: a point or a querySelector. */
export interface PreviewAutomationClickInput {
  x?: number
  y?: number
  selector?: string
}

/** automationType payload. */
export interface PreviewAutomationTypeInput {
  text: string
  selector?: string
}

/** automationPress payload. */
export interface PreviewAutomationPressInput {
  key: string
}

/** automationScroll payload. */
export interface PreviewAutomationScrollInput {
  x: number
  y: number
  deltaX: number
  deltaY: number
}

/** automationEvaluate payload. */
export interface PreviewAutomationEvaluateInput {
  expression: string
}

/** automationWaitFor poll conditions. */
export interface PreviewAutomationWaitForInput {
  selector?: string
  text?: string
  urlIncludes?: string
  timeoutMs?: number
}

/** One discovered loopback server. */
export interface DiscoveredServer {
  url: string
  port: number
}

/** Injected preview callbacks. */
export interface PreviewShellInjected {
  previewAvailable: boolean
  previewOpen: (input: { url: string; bounds?: PreviewBounds; scope?: string }) => Promise<PreviewResult>
  previewNavigate: (id: string, url: string) => Promise<PreviewResult>
  previewBack: (id: string) => Promise<PreviewNavState>
  previewForward: (id: string) => Promise<PreviewNavState>
  previewReload: (id: string) => Promise<PreviewNavState>
  previewHardReload: (id: string) => Promise<PreviewNavState>
  previewStop: (id: string) => Promise<PreviewNavState>
  previewZoomIn: (id: string) => Promise<PreviewNavState>
  previewZoomOut: (id: string) => Promise<PreviewNavState>
  previewResetZoom: (id: string) => Promise<PreviewNavState>
  previewSetColorScheme: (id: string, scheme: PreviewColorScheme) => Promise<PreviewNavState>
  previewClearCookies: () => Promise<{ ok: boolean }>
  previewClearCache: () => Promise<{ ok: boolean }>
  previewCaptureScreenshot: (id: string) => Promise<{
    ok: boolean
    pngBase64?: string
    path?: string
    mimeType?: string
    sizeBytes?: number
    message?: string
  }>
  previewOpenPictureInPicture: (id: string) => Promise<{ ok: boolean }>
  previewClosePictureInPicture: () => Promise<{ ok: boolean }>
  previewPickElement: (id: string) => Promise<PreviewPickResult>
  previewCancelPick: (id: string) => Promise<{ ok: boolean }>
  previewSetAnnotationTheme: (id: string, theme: PreviewAnnotationTheme) => Promise<{ ok: boolean }>
  appendComposerText?: (sessionId: string, text: string) => boolean | void
  previewStartRecording: (id: string) => Promise<{ ok: boolean; message?: string }>
  previewStopRecording: (id?: string) => Promise<{ ok: boolean; message?: string }>
  onPreviewRecordingFrame: (handler: (frame: PreviewRecordingFrame) => void) => () => void
  previewSaveRecording: (id: string, input: PreviewRecordingSaveInput) => Promise<{ ok: boolean; path?: string; message?: string }>
  previewRevealArtifact: (absolutePath: string) => Promise<{ ok: boolean; message?: string }>
  previewCopyArtifactToClipboard: (absolutePath: string) => Promise<{ ok: boolean; message?: string }>
  previewAutomationStatus: (id: string) => Promise<{
    ok: boolean
    available?: boolean
    url?: string | null
    title?: string | null
    loading?: boolean
    message?: string
  }>
  previewAutomationSnapshot: (id: string) => Promise<{
    ok: boolean
    title?: string
    url?: string
    html?: string
    screenshot?: { mimeType: string; data: string; width: number; height: number }
    message?: string
  }>
  previewAutomationClick: (id: string, input: PreviewAutomationClickInput) => Promise<{ ok: boolean; message?: string }>
  previewAutomationType: (id: string, input: PreviewAutomationTypeInput) => Promise<{ ok: boolean; message?: string }>
  previewAutomationPress: (id: string, input: PreviewAutomationPressInput) => Promise<{ ok: boolean; message?: string }>
  previewAutomationScroll: (id: string, input: PreviewAutomationScrollInput) => Promise<{ ok: boolean; message?: string }>
  previewAutomationEvaluate: (id: string, input: PreviewAutomationEvaluateInput) => Promise<{ ok: boolean; value?: unknown; message?: string }>
  previewAutomationWaitFor: (id: string, input: PreviewAutomationWaitForInput) => Promise<{ ok: boolean; message?: string }>
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
  previewHardReload?: PreviewShellInjected['previewHardReload']
  previewStop?: PreviewShellInjected['previewStop']
  previewZoomIn?: PreviewShellInjected['previewZoomIn']
  previewZoomOut?: PreviewShellInjected['previewZoomOut']
  previewResetZoom?: PreviewShellInjected['previewResetZoom']
  previewSetColorScheme?: PreviewShellInjected['previewSetColorScheme']
  previewClearCookies?: PreviewShellInjected['previewClearCookies']
  previewClearCache?: PreviewShellInjected['previewClearCache']
  previewCaptureScreenshot?: PreviewShellInjected['previewCaptureScreenshot']
  previewOpenPictureInPicture?: PreviewShellInjected['previewOpenPictureInPicture']
  previewClosePictureInPicture?: PreviewShellInjected['previewClosePictureInPicture']
  previewPickElement?: PreviewShellInjected['previewPickElement']
  previewCancelPick?: PreviewShellInjected['previewCancelPick']
  previewSetAnnotationTheme?: PreviewShellInjected['previewSetAnnotationTheme']
  previewStartRecording?: PreviewShellInjected['previewStartRecording']
  previewStopRecording?: PreviewShellInjected['previewStopRecording']
  onPreviewRecordingFrame?: PreviewShellInjected['onPreviewRecordingFrame']
  previewSaveRecording?: PreviewShellInjected['previewSaveRecording']
  previewRevealArtifact?: PreviewShellInjected['previewRevealArtifact']
  previewCopyArtifactToClipboard?: PreviewShellInjected['previewCopyArtifactToClipboard']
  previewAutomationStatus?: PreviewShellInjected['previewAutomationStatus']
  previewAutomationSnapshot?: PreviewShellInjected['previewAutomationSnapshot']
  previewAutomationClick?: PreviewShellInjected['previewAutomationClick']
  previewAutomationType?: PreviewShellInjected['previewAutomationType']
  previewAutomationPress?: PreviewShellInjected['previewAutomationPress']
  previewAutomationScroll?: PreviewShellInjected['previewAutomationScroll']
  previewAutomationEvaluate?: PreviewShellInjected['previewAutomationEvaluate']
  previewAutomationWaitFor?: PreviewShellInjected['previewAutomationWaitFor']
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
    previewHardReload: id => shell?.previewHardReload?.(id) ?? Promise.resolve(missing()),
    previewStop: id => shell?.previewStop?.(id) ?? Promise.resolve(missing()),
    previewZoomIn: id => shell?.previewZoomIn?.(id) ?? Promise.resolve(missing()),
    previewZoomOut: id => shell?.previewZoomOut?.(id) ?? Promise.resolve(missing()),
    previewResetZoom: id => shell?.previewResetZoom?.(id) ?? Promise.resolve(missing()),
    previewSetColorScheme: (id, scheme) => shell?.previewSetColorScheme?.(id, scheme) ?? Promise.resolve(missing()),
    previewClearCookies: () => shell?.previewClearCookies?.() ?? Promise.resolve({ ok: false }),
    previewClearCache: () => shell?.previewClearCache?.() ?? Promise.resolve({ ok: false }),
    previewCaptureScreenshot: id => shell?.previewCaptureScreenshot?.(id) ?? Promise.resolve({ ok: false }),
    previewOpenPictureInPicture: id => shell?.previewOpenPictureInPicture?.(id) ?? Promise.resolve({ ok: false }),
    previewClosePictureInPicture: () => shell?.previewClosePictureInPicture?.() ?? Promise.resolve({ ok: false }),
    previewPickElement: id => shell?.previewPickElement?.(id) ?? Promise.resolve({ ok: false }),
    previewCancelPick: id => shell?.previewCancelPick?.(id) ?? Promise.resolve({ ok: false }),
    previewSetAnnotationTheme: (id, theme) => shell?.previewSetAnnotationTheme?.(id, theme) ?? Promise.resolve({ ok: false }),
    previewStartRecording: id => shell?.previewStartRecording?.(id) ?? Promise.resolve({ ok: false }),
    previewStopRecording: id => shell?.previewStopRecording?.(id) ?? Promise.resolve({ ok: false }),
    onPreviewRecordingFrame: handler => (
      typeof shell?.onPreviewRecordingFrame === 'function'
        ? shell.onPreviewRecordingFrame(handler)
        : () => {}
    ),
    previewSaveRecording: (id, input) => shell?.previewSaveRecording?.(id, input) ?? Promise.resolve({ ok: false }),
    previewRevealArtifact: absolutePath => shell?.previewRevealArtifact?.(absolutePath) ?? Promise.resolve({ ok: false }),
    previewCopyArtifactToClipboard: absolutePath => (
      shell?.previewCopyArtifactToClipboard?.(absolutePath) ?? Promise.resolve({ ok: false })
    ),
    previewAutomationStatus: id => shell?.previewAutomationStatus?.(id) ?? Promise.resolve({ ok: false }),
    previewAutomationSnapshot: id => shell?.previewAutomationSnapshot?.(id) ?? Promise.resolve({ ok: false }),
    previewAutomationClick: (id, input) => shell?.previewAutomationClick?.(id, input) ?? Promise.resolve({ ok: false }),
    previewAutomationType: (id, input) => shell?.previewAutomationType?.(id, input) ?? Promise.resolve({ ok: false }),
    previewAutomationPress: (id, input) => shell?.previewAutomationPress?.(id, input) ?? Promise.resolve({ ok: false }),
    previewAutomationScroll: (id, input) => shell?.previewAutomationScroll?.(id, input) ?? Promise.resolve({ ok: false }),
    previewAutomationEvaluate: (id, input) => shell?.previewAutomationEvaluate?.(id, input) ?? Promise.resolve({ ok: false }),
    previewAutomationWaitFor: (id, input) => shell?.previewAutomationWaitFor?.(id, input) ?? Promise.resolve({ ok: false }),
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
