# Agent Note: Desktop marketplace curated catalog

Status: implemented

English | [中文](2026-08-18-desktop-marketplace-curated-catalog.zh.md)

## Problem

The desktop marketplace listed GitHub `topic:dsh-plugin` search hits in a second Electron window, then seeded a composer draft for Host `install_dsh_plugin`. That search is not the awesome-dsh-plugin registry. Host `installPlugin` accepts only `github:owner/repo[#ref]`, so curated monorepo `#path:` rows cannot install through that channel. Shipping `dshmarket` would add a second Settings UI and `/dsh-market/*` HTTP routes that do not use `ui-primitives`.

## Decision

**The only UI is the Settings tab `settings.plugins.tab` with id `marketplace`.** Tray and menu `openMarketplace()` show the main window and jump to Settings → Plugins → Marketplace. When Harness is not loaded, that call records a pending jump and shows the main window; it never creates a marketplace `BrowserWindow`. The tab uses `ui-primitives` (`Input` / `Button` / `Menu` / `Modal` / `FlipText`) and `--dsw-alias-*`. Confirm Modals show the catalog `installSpec` verbatim, then call `installMarketplacePlugin(id)`. There is no GitHub Token field.

**The catalog is `https://awesome-dsh-plugin.com/plugins.json`.** The main process fetches it (`DSHD_MARKETPLACE_REGISTRY_URL` in tests). Timeout is 4 seconds. A success body is an object with a non-empty `plugins` array. `listMarketplace({ refresh?, locale? })` locale is `zh` | `en` (default `zh`; `zh*` maps to `zh`). Disk cache lives under `app.getPath('userData')` with `CACHE_VERSION` 3 and a 1-hour TTL. Fallback order is memory, then disk, then the packaged snapshot `src/main/marketplace-registry-snapshot.json`. `source` is `live` | `cache` | `snapshot`; non-live carries `warning`. Empty at every layer returns `ok: false`, `items: []`, and a visible warning. The Settings tab applies a successful catalog payload, including empty `items` (it clears cards). It keeps the last cards only when `listMarketplace` throws. A successful catalog is applied even when `listInstalled` throws; that throw keeps the last installed map and sets the catalog error warning when the catalog itself succeeded. There is no GitHub topic search.

`installSpec` matches dsh-market `installTargetFor`: a valid registry `npm` name; otherwise `github:owner/repo` or `github:owner/repo#path:/<posix>` from the GitHub `url` (`/tree/<ref>/<posix>`). The last whitespace token of `install` is used only when `isAllowedMarketplaceSpec` accepts it: a last-token npm name must equal the row `npm` field (`npm: null` maps to empty `installSpec`). Tarball, git, and file URLs never become `installSpec`. Catalog `id` is `owner/name` (the name may contain `#`).

**Install paths stay split.** `installMarketplacePlugin(id)` looks up that id in the current catalog (memory, else disk, else snapshot). Only that row's `installSpec` may reach `dsh plugin --profile web add`. Allowed specs: a registry npm name that passes `isValidPackageName`; `github:owner/repo` or `github:owner/repo#<gitRef>` that pass `isValidGithubSpec` and match the row's GitHub URL; `github:owner/repo#path:/<posix>` where the posix path has no `..`, `:`, or backslash, and owner/repo matches the row URL (`isValidMarketplacePathSpec`). Rejected before the CLI: `file:`, `link:`, tarball or git URLs, unknown ids, `DROPPED` packages, invalid `allowBuilds`. A stored desktop GitHub token may pin a SHA; without a token the install uses a floating ref.

`installPlugin(spec)` remains github-only (`isValidGithubSpec`) for the Host `install_dsh_plugin` control channel. The Settings tab does not call it.

Add and remove share one in-flight mutex. Installed names come from new profile keys, new `node_modules` directories, or an existing profile spec that matches the github identity. A successful add with no loadable dsh entry (boolean `dsh.bundle.patch: true` is not enough) or a duplicate inserted loader id is removed immediately and reported as failure. `ok: false` does not call `startHarness()`. If add, Host `install-plugin`, or uninstall succeeded and `startHarness()` throws, IPC returns `ok: true` with `harnessStarted: false`. Add copy says the plugin is already in the web profile; uninstall copy says it is already out. The Settings tab uses locale strings for those dialogs, not the IPC Chinese `error`. `needsAllowBuilds` confirms once and retries with the allow list, including ndjson-escaped prepare-not-allowed names and `name@git+https://github.com/owner/repo.git` keys. The renderer sends only the catalog id.

Screenshot galleries, an in-tab theme page, update checks, hot disable, backup, and diagnostics are absent from this decision.

## Alternatives considered

**Preinstall or vendor `dshmarket` (dsh-market 1.12.1).** Rejected: that plugin ships its own `MarketSection` and `/dsh-market/*` HTTP routes. The product surface is the existing Settings tab with `ui-primitives` and `--dsw-alias-*`. Catalog fetch and install whitelist can match without installing that package.

**Keep a second Electron marketplace window (`src/renderer/marketplace/`).** Rejected: a second `file:` document needs a parallel palette, a marketplace IPC role, and navigation pins onto `marketplace/index.html`. Tray and menu `openMarketplace()` open Settings instead.

**Validate `#path:` specs with `isValidGithubSpec`.** Rejected: Host `installPlugin` must stay github-only (`github:owner/repo[#ref]`). `#path:` is a marketplace catalog token. Widening `isValidGithubSpec` would let the Host control channel accept monorepo paths. Marketplace path specs use `isValidMarketplacePathSpec`.

## Consequences

There is no standalone marketplace window, no `IPC_ROLES.MARKETPLACE`, and no `shell:seed-install-draft`. Privileged navigation pins boot `file:` to packaged `boot.html` only. Settings marketplace install goes through catalog id. Host `install_dsh_plugin` remains github-only. Offline catalog uses cache then snapshot; it does not search GitHub.

## Testing

`src/main/marketplace-catalog.test.js` pins locale mapping, npm / github / `#path:` specs from `installTargetFor` (including Release tarball `install` commands that still resolve to `github:`), last-token fallback that is not allow-listed becoming empty `installSpec`, last-token npm with no registry `npm` becoming empty, `DROPPED` filtering, TTL expiry, 4s abort, and live → cache → snapshot fallback. `src/main/marketplace-install.test.js` pins `installMarketplacePlugin(id)` lookup, unknown id, `DROPPED`, invalid `allowBuilds`, catalog `#path:` allowed while `installPlugin` rejects it, path `..` / backslash / colon rejection on GitHub blob homepages so owner/repo matches, owner/repo URL mismatch, tarball `install` commands installing `github:`, SHA pin only when a token is stored, the add/remove mutex, node_modules-only and already-present rollback, boolean `patch: true` rejection, and duplicate loader-id rollback. `src/main/ipc.test.js` pins `startHarness()` throw after a successful add, Host `install-plugin`, or uninstall returning `ok: true` / `harnessStarted: false`. `src/main/window-marketplace.test.js` pins `openMarketplace` with no `marketplace/index.html` window. `src/main/ipc-authorization.test.js` pins the absence of a `MARKETPLACE` role. `src/main/local-url.test.js` pins the absence of `isMarketplaceNavigationUrl`. `ui-settings-plugin-inventory` pins list and filter, Modal confirm of `installSpec`, `installMarketplacePlugin(id)`, uninstall confirm, no Token field, empty-`installSpec` cards without Install, exact `#path:` installed matching, a successful empty refresh clearing cards even when `listInstalled` throws, a thrown catalog read keeping cards, locale Harness-down copy after install, and uninstall Harness-down copy.

## Related

- [Right-panel and terminal work loops](2026-08-16-surfaces-terminal-work-loops.md)
- [Host install_dsh_plugin control channel](2026-08-15-marketplace-draft-install.md)
