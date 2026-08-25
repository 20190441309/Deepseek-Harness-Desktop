# @deepseek-ai/dsh-client-ui-settings-market

English | [中文](README.zh.md)

Desktop-owned **plugin marketplace** settings section (id `market`, nav label **市场** / **Marketplace**). The browser plugin registers a `settings.section` contribution only when Electron `window.shell` exposes `listMarketplace`, `listInstalledPlugins`, `installMarketplacePlugin`, `uninstallPlugin`, and `onPluginProgress`. A plain `dsh web` browser has no section. The section renders the curated catalog the desktop main process fetches from plugins.json (with cache/snapshot fallback and its `warning` line shown as-is), a search box, category chips, and one card per row with owner, description, stars, and an Install or Uninstall action. Install passes only the registry `owner/name` id to the desktop engine, which resolves and validates the CLI spec, writes into the desktop `dsh-home/profiles/web`, and restarts Harness; progress lines from `shell:plugin-progress` stream into a bounded log. A `needsAllowBuilds` result opens an inline approval (`role="alertdialog"`) listing the exact allowBuilds keys before retrying. Failures render as `role="alert"` text — including the profile-written-but-Harness-down case — never silently.

This section replaces the third-party `dshmarket` plugin the desktop used to preset-install: the marketplace UI and engine are both desktop-owned now, and the desktop keeps `dshmarket` out of its mounted composition so two `market` sections cannot register. The section reads and writes only through the injected desktop callbacks and imports no other UI plugin's values.

## Model Experience

None, as this package only manages plugin installation from a curated catalog and registers nothing model-facing.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- **Marketplace is desktop-only** — the catalog fetch, install lock, and CLI live in the Electron main process.
- **First slice of the desktop-owned market** — upstream dshmarket's theme shop, backup/Gist, diagnostics, hot updates, and multi-source management are not ported; the deferred list lives on the desktop feature card `marketplace-settings`.
- **Installed detection is name/spec based** — a github install that renames its package is matched by `owner/repo` substring on the stored spec.
