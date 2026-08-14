/**
 * Desktop shell bridge used by the marketplace Settings tab.
 * Absent outside the desktop app, so registration and the tab both branch on it.
 */

/** One catalog row from the desktop marketplace directory. */
export type MarketplaceItem = {
  id: string
  owner: string
  repo: string
  description: string
  stars: number
  packageName: string
  homepage: string
  installSpec: string
  isBundle: boolean
  category: string
  updated?: string
  pushed?: string
  license?: string
  topics?: string[]
  keywords?: string[]
}

/** Category chip projected by the desktop catalog. */
export type MarketplaceCategory = {
  id: string
  label: string
  count: number
}

/** Directory payload returned by the desktop shell. */
export type MarketplaceCatalog = {
  items?: MarketplaceItem[]
  categories?: MarketplaceCategory[]
  warning?: string
  fetchedAt?: number
}

/** Installed web-profile plugins. */
export type InstalledPlugins = {
  plugins?: Array<{ name: string; spec: string }>
}

/** Result of an install or uninstall. */
export type MarketplaceInstallResult = {
  ok?: boolean
  needsAllowBuilds?: boolean
  allowBuilds?: string[]
  error?: string
  log?: string
}

/** Progress line pushed while pnpm runs. */
export type MarketplaceProgress = {
  line?: string
}

/** The preload-exposed desktop API used by the marketplace tab. */
export type DesktopShell = {
  listMarketplace?: (options?: { refresh?: boolean }) => Promise<MarketplaceCatalog>
  refreshMarketplace?: () => Promise<MarketplaceCatalog>
  listInstalledPlugins?: () => Promise<InstalledPlugins>
  installPlugin?: (spec: string, options?: { allowBuilds?: string[] }) => Promise<MarketplaceInstallResult>
  uninstallPlugin?: (name: string) => Promise<MarketplaceInstallResult>
  openExternal?: (url: string) => Promise<boolean>
  saveConfig?: (patch: { githubToken?: string }) => Promise<{ hasGithubToken?: boolean }>
  getConfig?: () => Promise<{ hasGithubToken?: boolean }>
  onPluginProgress?: (handler: (payload: MarketplaceProgress) => void) => () => void
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
