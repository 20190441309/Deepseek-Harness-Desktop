# Deepseek-Harness-Desktop

[中文](README.md) · English

An Electron desktop shell on top of the official [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) Web UI.

No custom chat UI: Electron owns the window, tray, workspace, API key, and launch orchestration. Chat, tool calls, and approvals stay the official `dsh web`. A few small tweaks around third-party thinking intensity, a vision fallback model, themes and wallpapers, and the like. I just really like GUIs — issues, suggestions, and PRs are all welcome.

<p align="center">
  <img src="assets/screenshot-home.png" alt="Deepseek-Harness-Desktop" width="920" />
</p>

## WeChat group

<div align="center">

![Deepseek-Harness-Desktop WeChat group](assets/wechat-group.png)

Scan to join: tips, troubleshooting, and feature requests.

</div>

## Features

- **Frameless window with a custom title bar**: draggable, double-click to maximize, working minimize / maximize / close buttons, background follows the theme
- **Automatic Harness launch**: probes `127.0.0.1:3080` on startup — kills leftover dsh processes from a previous run, or hops to a free port if something else is bound there
- **Three-stage launch chain**: bundled build in `vendor/deepseek-harness` → local `dsh` → `npx @deepseek-ai/dsh`; one of them will come up
- **Auto workspace registration**: registers the workspace directory into Harness over RPC at boot, no manual setup
- **Settings are Harness settings** (`Ctrl+,`): models, plugins, About, update check, and online install all live in the official settings panel
- **System tray**: show window, settings, restart Harness, quit
- **Auto-update**: a green "Update available" button appears beside Settings when a newer release exists — one click updates online; Settings → About still offers a manual check
- **API key stored separately**: `config.json` and `credentials.json` are split; the key is injected into the dsh process via `DEEPSEEK_API_KEY`
- **Third-party thinking intensity**: custom / third-party models can enable Low / Medium / High / Very High / Extreme; the composer then lets you pick a reasoning level
- **Vision fallback model**: when the main model (DeepSeek included) cannot see images, a dedicated vision model describes the picture first, then the main model works from that description
- **Themes and wallpaper**: Settings → Appearance — pick a built-in family or author your own; drop a wallpaper behind the UI and tune frost, pixelation, and glass opacity
- **Plugin marketplace**: Settings → Plugins → Marketplace, beside Plugin configuration and Plugin list. Menu / tray / title-bar / `Ctrl+Shift+M` open that tab. Catalog is only the GitHub [`dsh-plugin`](https://github.com/topics/dsh-plugin) topic, grouped into UI, workflow, tools, notifications, development, and learning. Install uses official `dsh plugin --profile web add github:owner/repo` and restarts Harness. Git installs run the repo's prepare script on this machine — only install plugins you trust. If GitHub rate-limits you, save a token on that tab.
- **Titlebar Git**: with working-tree changes the primary button is Commit & push; the menu can Commit only, and the default branch asks for confirmation
- **Bottom terminal and right panel**: titlebar toggles open the bottom PTY and the five-card right panel (Files / Diff / Terminal / Browser / Agents); the drawer and the Terminal card share one session family. Tool details stay in the existing details column and are independent of the right panel

### Third-party thinking intensity

Settings → Model → edit a custom provider, then tick thinking intensity on the model. After save, the composer model menu shows Reasoning level.

<p align="center">
  <img src="assets/screenshot-thinking-settings.png" alt="Enable thinking intensity on a third-party model" width="920" />
</p>

<p align="center">
  <img src="assets/screenshot-thinking-chat.png" alt="Pick a reasoning level in the composer" width="920" />
</p>

### Vision fallback model

Settings → Model → Vision model. Pick a model that accepts images. When the main model cannot see pictures, that model describes the image first, then the main model works from the description.

<p align="center">
  <img src="assets/screenshot-vision-settings.png" alt="Configure a dedicated vision model" width="920" />
</p>

<p align="center">
  <img src="assets/screenshot-vision-chat.png" alt="Vision model describes the image for a text-only main model" width="920" />
</p>

### Themes and wallpaper

Settings → Appearance. Light / Dark / System stay separate from the theme family; each card has a light half and a dark half — click the half you want. Create, duplicate, edit, import, and export custom families. The accent paints the send button, user bubbles, and the selected sidebar item.

A wallpaper sits behind the whole UI. Once set, frost, pixelation, and glass opacity sliders appear: lower opacity makes the sidebar, dialogs, and composer more see-through.

<p align="center">
  <img src="assets/screenshot-theme-library.png" alt="Appearance theme library: built-in and custom families" width="920" />
</p>

<p align="center">
  <img src="assets/screenshot-theme-wallpaper-settings.png" alt="Wallpaper, frost, pixelation, and glass opacity" width="920" />
</p>

<p align="center">
  <img src="assets/screenshot-theme-wallpaper-chat.png" alt="Conversation with a wallpaper behind the glass UI" width="920" />
</p>

## Install

Just want to use it? Grab the latest NSIS installer (`Deepseek-Harness-Desktop-Setup-x.y.z.exe`) from [Releases](https://github.com/ChisaAlter/Deepseek-Harness-Desktop/releases) — no local Node required.

Only Windows x64 packages are published for now; on macOS / Linux, run from source — official packaging is not provided yet.

## Run from source

Windows 10+, Node 22.19+ / 24+, pnpm 11. Get an API key from [DeepSeek](https://platform.deepseek.com/).

```powershell
git clone https://github.com/ChisaAlter/Deepseek-Harness-Desktop.git
cd Deepseek-Harness-Desktop
npm install
npm run setup:harness
npm start
```

The Harness source ships with the repo (`vendor/deepseek-harness`); the first `setup:harness` installs dependencies and runs a full build — slow. After that, `npm start`. If Electron isn't found, point `ELECTRON_PATH` at `electron.exe`.

### Everyday usage

| Action | How |
| --- | --- |
| Settings | `Ctrl+,` or tray menu |
| Plugin marketplace | Settings → Plugins → Marketplace; `Ctrl+Shift+M`, tray, or the title-bar button open the same tab |
| Restart Harness | `Ctrl+Shift+R` |
| Reload UI | `Ctrl+R` |
| DevTools | `Ctrl+Shift+I` |
| Close window | Minimizes to tray by default (change in Settings) |

## How it's wired

Upstream lives in `vendor/deepseek-harness`; we boot the built `dsh web` (default `127.0.0.1:3080`). Launch order: integrated source build → local `dsh` → `npx`. Once the service is reachable, the window loads the Web UI and registers the workspace.

Custom / third-party providers go through the pi-ai adapter. You can tick thinking intensity on a model (low / medium / high / xhigh / max); that lands in `reasoningEfforts` and shows up in the composer. When the main model cannot see images, a dedicated vision model can describe the picture first. Theme families, wallpaper, and glass opacity live in the `ui-theme` section of `$DSH_HOME/settings.yaml`. Official DeepSeek defaults are left alone.

To change the UI, edit `vendor/deepseek-harness`, run `pnpm run build` there, then restart the desktop app. Harness is still a developer preview — expect it to move.

### Local development vs. upstream sync

`vendor/deepseek-harness` is a [git subtree](https://git-scm.com/book/en/v2/Git-Tools-Advanced-Merging#_subtree_merge):

- **Local changes**: edit files under `vendor/deepseek-harness` and commit them like any other code in this repo — no patch files to maintain.
- **Pulling upstream updates**: `npm run sync:harness` (a `git subtree pull --squash` under the hood). Git performs a three-way merge, so upstream changes and local customizations combine automatically; you only resolve conflicts where both sides touched the same lines, then `git add` + `git commit`. Rebuild with `npm run setup:harness` afterwards.
- **Inspecting local customizations**: commits in `git log --oneline -- vendor/deepseek-harness` other than `Sync/Squashed` ones are the local development history; every upstream snapshot commit carries a `git-subtree-split` footer with the upstream commit SHA for comparison.

## Packaging & releases

Build locally:

```powershell
npm run dist
```

Output lands in `dist/`: an NSIS installer (`Deepseek-Harness-Desktop-Setup-x.y.z.exe`). Packaging dereferences `vendor/deepseek-harness` into `resources/` and bundles a `node.exe`, so the installed app doesn't need a local Node. A full build requires the dsh artifacts (`apps/cli/lib/bin.js` + `apps/web/dist/index.html`).

### CI builds (recommended)

Shipping the ~1.4 GB vendored harness into the installer makes local builds slow. Use the GitHub Actions workflow (`.github/workflows/release.yml`) instead:

- **Manual build**: Actions page → Build Windows Installer → Run workflow; grab the installers from the artifacts
- **Auto release**: pushing a `v*` tag (e.g. `v0.1.0`) builds and publishes a GitHub Release automatically

Once a version is on GitHub Releases, the in-app update check picks it up.

## Community acknowledgments

- [Linux.do](https://linux.do)

## License

[MIT](LICENSE)
