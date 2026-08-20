# Agent Note: Wallpaper gallery and crop

Status: implemented

English | [中文](2026-08-18-wallpaper-gallery-and-crop.zh.md)

## Problem

Appearance stored an optional wallpaper as a data URL with frost and pixelate sliders. A local file write used CSS `object-fit: cover` at paint time, so the user could not choose which region survived, and there was no in-app catalog. Third-party wallpaper APIs that require keys, hotlinking, or HTML gallery pages do not match the existing Host data-URL cap or the desktop fetch rules.

## Decision

**User HTTPS JSON catalogs are the gallery source.** `wallpaperCatalogUrls` holds at most eight unique `https:` strings, each at most 500 characters, in Host `ui-theme` — not desktop `config.json` and not the plugin marketplace. `wallpaperBingEnabled` defaults to false. The renderer sends that list on each gallery open; the main process does not persist it. Catalog JSON is either Bing `images[]` or `{ version, items: [{ id, title, thumbUrl, imageUrl, copyright? }] }`. Fetch is HTTPS only except `DSHD_WALLPAPER_ALLOW_HTTP=1` for fixtures. Caps: 4MB JSON, 500 items per source, 12MB image, at most four redirects followed by hand with `Location` re-checked, no cookies. A body without `Content-Length` is read incrementally and aborted at the byte cap. Thumbs may load in `<img src>`; the crop source must go through `downloadWallpaper` to a data URL.

**Bing HPImageArchive is an optional live network source, not a bundled pack.** When the Appearance toggle is on, the desktop main process fetches two HPImageArchive pages: `idx=0&n=8` and `idx=8&n=8` at `https://cn.bing.com/HPImageArchive.aspx?format=js&mkt=zh-CN` (override `DSHD_BING_WALLPAPER_URL` in tests; `{idx}` expands to both pages). Entries with `wp === false` are dropped. Full images use `{origin}{urlbase}_1920x1080.jpg` and thumbs `_400x240.jpg`. UHD is not fetched: the wallpaper data URL already caps near 1.8MB and the long edge at 1920. Appearance states that Bing’s archive is wallpaper-use only.

**Every persist path crops to the current window aspect.** Local file pick and gallery pick open the same crop dialog (pan, wheel/slider zoom, mask locked to `window.innerWidth / innerHeight`). Confirm stays disabled until the preview `load` reports a natural size; a window `resize` updates the mask. Confirm bakes JPEG through `cropWallpaper` then `setWallpaper`; a failed crop (including decode that never settles within `CROP_DECODE_TIMEOUT_MS`) keeps the dialog and does not write the uncropped source. Closing the dialog while `cropWallpaper` is in flight does not persist. Dismiss bumps the crop session token synchronously even if `open` has not flipped yet. The crop preview `<img>` is not rendered when `image` is empty, so Presence exit does not fetch `src=""`. Closing the gallery bumps a download session token; a finishing `downloadWallpaper` does not open crop. Local picks larger than `MAX_WALLPAPER_FILE_BYTES` (12MB, same as main image fetch) are rejected before `FileReader`. Gallery thumbs use `referrerPolicy="no-referrer"`; they still load in `<img src>` (not `crossOrigin`). A failed gallery download stays in the gallery with the download error. A local file that is not a readable image stays on the row with pick-failed copy. Adding a catalog URL that `sanitizeWallpaperCatalogUrls` drops (non-`https:`, duplicate, too long) keeps the draft and shows catalog-rejected copy. An existing wallpaper can crop again from the stored data URL through Appearance Adjust wallpaper. `apply` injects `listWallpaperCatalog` / `downloadWallpaper` only when `window.shell` exposes both; plain `dsh web` keeps local pick and crop and hides the gallery and source editor.

This extends the Appearance extras in the [theme-family Appearance system](2026-08-14-theme-family-appearance-system.md). The two new fields ride the same Host `ui-theme` section as the other Appearance extras ([Host-backed preferences](../bug-fix/2026-08-06-host-backed-web-preferences.md)). The baked JPEG still obeys the [canvas solidity and data-URL cap](../bug-fix/2026-08-15-appearance-nav-contrast-and-wallpaper-canvas-cap.md).

## Alternatives considered

**Unsplash / Pexels / similar as built-in sources.** Rejected: wallpaper-app terms forbid that use, and those APIs want hotlinked originals rather than a baked data URL.

**Scraped 360 wallpaper endpoints or multi-year Bing GitHub archives.** Rejected: unofficial, brittle, and outside the official HPImageArchive contract.

**HTML galleries or partner wallpaper-app APIs (account, cookies, points).** Rejected: the catalog parser accepts only the two JSON forms above, fetch carries no cookies, and originals must become a data URL without a third-party paywall.

**Hotlink the catalog `imageUrl` as the wallpaper layer.** Rejected: the Host document already stores a data URL with a size cap; a live remote URL would CORS-taint canvas, break offline, and skip the crop bake.

**A second Electron window or a marketplace settings tab.** Rejected: the product surface is Appearance `settings.section` id `appearance`, using `ui-primitives` and `--dsw-alias-*`.

## Consequences

Desktop Appearance can list up to eight custom JSON catalogs and crop before save. Bing is queried only when `wallpaperBingEnabled` is true. `dsh web` does not fetch catalogs. A bad catalog URL warns on that source and leaves the others. Search, categories, daily auto-swap, favorites, and adult feeds are absent.

## Testing

Desktop wallpaper-catalog tests pin Bing omitted unless `includeBing` is true, `wp:false` drop, two-page `{idx}` merge, native `items` including a 500-item cap, JSON under 4MB kept, a chunked body aborted at 4MB, disallowed URLs, hop-capped redirects, and a failed source that does not drop the others. `appearance-section.client.spec.tsx` pins local pick → crop → `setWallpaper` receiving `cropWallpaper`'s return, a cancelled local-pick crop that does not persist, Appearance Adjust wallpaper reopening crop from the stored data URL, a cancel during an in-flight crop that does not persist, empty `img[src=""]` absence after crop dismiss, a local File larger than `MAX_WALLPAPER_FILE_BYTES` rejected before `FileReader`, a gallery download that finishes after close not opening crop, a failed crop that does not persist the source, Use disabled until preview load, resize rebake against the live window aspect, hidden gallery without shell, Bing rows plus crop write, catalog URL edits, a rejected `http:` catalog URL with copy, download-error copy, fetch-failure copy, and local pick-failed copy. `wallpaper-crop-modal.client.spec.tsx` pins cancel while `open` stays true so an in-flight crop cannot confirm. `wallpaper.client.spec.ts` pins crop-rectangle math, JPEG `toDataURL('image/jpeg')` export, and a hanging decode that returns null after `CROP_DECODE_TIMEOUT_MS`. `theme.client.spec.ts` pins a Host section that omits `wallpaperBingEnabled` staying off. `apply.client.spec.ts` pins the desktop-shell inject of both catalog callbacks.

## Related

- [Theme-family Appearance system](2026-08-14-theme-family-appearance-system.md)
- [Host-backed Web preferences](../bug-fix/2026-08-06-host-backed-web-preferences.md)
- [Appearance nav contrast and wallpaper canvas cap](../bug-fix/2026-08-15-appearance-nav-contrast-and-wallpaper-canvas-cap.md)
