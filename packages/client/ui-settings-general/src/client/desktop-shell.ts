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

/**
 * Harness auto-recovery policy the desktop shell persists and enforces: when
 * the Harness process exits unexpectedly, restart it up to
 * `harnessRestartMaxAttempts` times, backing off `harnessRestartBaseDelayMs`
 * between attempts. Values are optional on the wire; the row normalizes them
 * (see `normalizeHarnessRestart`).
 */
export type HarnessRestartConfig = {
  harnessAutoRestart: boolean
  harnessRestartMaxAttempts: number
  harnessRestartBaseDelayMs: number
}

/** The max-attempt choices the settings row offers. */
export const HARNESS_RESTART_MAX_ATTEMPTS = [1, 3, 5] as const

/** The base-delay choices the settings row offers (ms). */
export const HARNESS_RESTART_BASE_DELAYS_MS = [1000, 2000, 5000] as const

/** Fallback policy for a shell that reports nothing for a preference. */
export const HARNESS_RESTART_DEFAULTS: HarnessRestartConfig = {
  harnessAutoRestart: true,
  harnessRestartMaxAttempts: 3,
  harnessRestartBaseDelayMs: 1000,
}

/**
 * Coerce a shell-reported (possibly partial) harness restart configuration
 * into the row's canonical values: any value outside the offered option sets
 * falls back to the product defaults, including an enabled switch.
 * @param input - the raw config from getConfig/saveConfig, or nothing.
 * @returns the normalized policy the row renders and writes from.
 */
export function normalizeHarnessRestart(input?: Partial<HarnessRestartConfig> | null): HarnessRestartConfig {
  const attempts = input?.harnessRestartMaxAttempts
  const delay = input?.harnessRestartBaseDelayMs
  return {
    harnessAutoRestart: typeof input?.harnessAutoRestart === 'boolean'
      ? input.harnessAutoRestart
      : HARNESS_RESTART_DEFAULTS.harnessAutoRestart,
    harnessRestartMaxAttempts: attempts === 1 || attempts === 3 || attempts === 5
      ? attempts
      : HARNESS_RESTART_DEFAULTS.harnessRestartMaxAttempts,
    harnessRestartBaseDelayMs: delay === 1000 || delay === 2000 || delay === 5000
      ? delay
      : HARNESS_RESTART_DEFAULTS.harnessRestartBaseDelayMs,
  }
}

/** The preload-exposed desktop API surface used by the settings UI. */
export type DesktopShell = {
  getConfig?: () => Promise<{
    appVersion?: string
    repoUrl?: string
    releasesUrl?: string
  } & Partial<HarnessRestartConfig>>
  saveConfig?: (patch: Partial<HarnessRestartConfig>) => Promise<Partial<HarnessRestartConfig>>
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
