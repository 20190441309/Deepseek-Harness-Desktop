# Agent Note: Desktop presets dshmarket

Status: implemented

English | [中文](2026-08-19-desktop-dshmarket-preset.zh.md)

## Problem

The desktop clone of the marketplace (`settings.plugins.tab` id `marketplace`) was not [dsh-market](https://github.com/dsh-market/dsh-market). A first-boot `dsh plugin add dshmarket` still needs the npm registry and fails closed for offline users.

## Decision

**Deepseek-Harness-Desktop ships the published `dshmarket` 1.14.0 package in `vendor/dshmarket`.** Before `dsh.start()`, `ensureDshMarketPlugin` copies that tree into the web profile `desktop-plugins/dshmarket`, junctions `node_modules/dshmarket` at the copy when that path is not already a real directory, and upserts a managed `cordis.patch.yml` insert (`id: dsh-market`, `name: dshmarket`). It does not run `dsh plugin add`. A missing bundled `package.json` is logged and does not abort Harness start. If the profile already lists `dshmarket` in `dsh.profile.bundles`, the copy still refreshes `desktop-plugins` and the managed insert is stripped so the Loader does not see two `dsh-market` rows.

**There is no cloned marketplace tab.** `ui-settings-plugin-inventory` registers only the Plugin list tab (`id: 'all'`). The market UI is `dshmarket`'s `settings.section` with id `market` (`MarketSection` plus `/dsh-market/*` on the Harness origin).

**Tray and menu `openMarketplace()` jump to that section.** They show the main window and run `openHarnessSettings('market')`. When Harness is not loaded, the call records a pending jump and never creates a marketplace `BrowserWindow`.

Main-process catalog fetch and `installMarketplacePlugin(id)` stay for Host `install_dsh_plugin` and IPC callers; they are not the Settings marketplace UI. That Host path remains [Desktop marketplace curated catalog](2026-08-18-desktop-marketplace-curated-catalog.md).

## Alternatives considered

- **Copy `MarketSection.tsx` into `ui-settings-plugin-inventory` and keep the Plugins tab** — still a fork of their UI, and client per-file coverage would own a 100k-line third-party page.
- **Keep the clone tab beside `dshmarket`'s section** — two markets in Settings.
- **First-boot `dsh plugin add dshmarket`** — needs npm, and a failed add leaves Settings without a market.
- **Add `dshmarket` to the official web profile template** — only stock bundle lists would gain it; user-owned lists would not.

## Consequences

Settings → 插件市场 is the bundled plugin, as its own nav row, not a tab under 插件. Unofficial `dshmarket` CSS ships with that package. App updates refresh the profile copy. A pnpm-installed `node_modules/dshmarket` directory is left in place. `--skip-user-plugins` recovery omits the user patch insert until a full plugin start.

## Testing

`src/main/dshmarket-preset.test.js` pins copy plus managed insert, refresh of the copy, skip/strip insert when `dsh.profile.bundles` already lists `dshmarket`, leave a real `node_modules/dshmarket` directory, fail closed on a missing bundled `package.json`, and the vendored 1.14.0 tree. `src/main/harness-controller.test.js` pins the preset after the desktop install plugin and before `dsh.start()`, and a failed preset that still starts Harness. `src/main/window-marketplace.test.js` pins `openMarketplace` injecting `settings.section` id `market` and never loading `marketplace/index.html`. `ui-settings-plugin-inventory` `browser-plugin.client.spec.tsx` pins no `marketplace` tab when `window.shell` is present.

## Related

- [Desktop marketplace curated catalog](2026-08-18-desktop-marketplace-curated-catalog.md)
