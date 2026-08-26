# Agent Note: Market section Discover/Installed restyle

Status: implemented

English | [中文](2026-08-26-market-section-discover-installed-restyle.zh.md)

## Problem

The first slice of the desktop-owned market section ([2026-08-25](2026-08-25-desktop-owned-market-section.md)) shipped a single flat page: hand-rolled search input and category chips, a bare two-column card list with no owner identity, no homepage link, no deprecated marker, and no installed-management view. Users coming from the retired `dshmarket` plugin read it as a downgrade — the original market had a Discover/Installed tab pair, owner avatars, star counts, and category tags. The desktop QA walk (`release-ui-walk.js` steps `market.discover` / `market.installed`) still asserts that tabbed structure, so the flat page also failed the desktop `qa:source` gate.

## Decision

Restyle `ui-settings-market` to the official settings language at the original market's UX density, without restoring the plugin:

- **Structure**: a 16/24 section heading with intro line and a 28px refresh icon action (the `McpSection` pattern), then a `Pill` tab pair — 发现 (Discover) and 已安装 (Installed, label suffixed with the installed count). Panes swap under the official `data-dsh-motion="swap"` recipe keyed by tab.
- **Discover**: `Input` primitive search (replacing the hand-rolled box), `Pill` category chips (keeping the `radiogroup`/`radio` semantics), a warning banner with `IconWarningOutline16`, a result-count line (`data-market-count` retained), and an auto-fill 280px card grid. Each card shows the owner's GitHub avatar (`https://github.com/<owner>.png`, browser-cached, initial-letter fallback on error — the upstream dsh-market approach), repo name, ★ star count, two-line clamped description, localized category tag, a deprecated badge from the catalog's `deprecated` flag, and a homepage link the desktop window handler routes to the external browser. Installed rows show a success-colored marker plus ghost Uninstall; others a primary Install.
- **Installed**: profile rows grouped by catalog category in catalog order, uncatalogued rows under 未分组/Ungrouped last, hairline row list (border-l1 top/bottom, interactive hover token) with name, spec in code face, a 已退役 badge on `DROPPED` rows, and per-row uninstall. Empty state points back to Discover with the upstream copy the QA walk keys on.
- **Tokens only**: every color is a `--dsw-alias-*` token; the two references to the nonexistent `--dsw-alias-state-warning-primary` (silently falling through to their fallbacks) were corrected to `--dsw-alias-state-warn-primary`.

The inject face, IPC channels, and install/uninstall/allow-builds/progress flows are unchanged; deferred v1 features (theme shop, backup, diagnostics, hot update, multi-registry, trial) stay cut.

## Alternatives considered

- **Keep the flat page and patch the QA walk instead** — rejected: the walk encodes the product's expectation (discover/installed) and the flat page was the complaint.
- **Port the dshmarket pager/detail dialog/screenshot strip** — not needed at curated-catalog scale; screenshots stay available on the item type if a detail view lands later.
- **A custom underline tab bar like upstream dshmarket** — rejected for the `Pill` primitive; the design language forbids a second tab skin.

## Consequences

Settings → 市场 now reads as an official settings page with the original market's information density. The desktop QA walk's `market.discover` / `market.installed` steps match the section again (Discover tab label, Installed tab with count suffix, `installedEmpty` / 未分组 copy). Avatar images are the only new network fetches, load lazily from `github.com`, and degrade to a local initial tile.

## Testing

`packages/client/ui-settings-market` client specs grew from 13 to 21: tab pair and count suffix, per-card owner/stars/category/homepage, avatar error fallback, deprecated and dropped badges, warning + result count, installed grouping order, installed-tab uninstall, and the empty-installed copy, alongside the existing search/filter/install/allow-builds/progress/failure specs.
