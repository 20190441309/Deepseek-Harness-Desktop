# Deepseek-Harness-Desktop

Desktop client based on the official DeepSeek Harness Web UI.

Themes, wallpapers, and other personalization options.

Download, install, and run — DSH is bundled.

[中文](README.md) · English · [Download](https://github.com/ChisaAlter/Deepseek-Harness-Desktop/releases/latest) · [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)

## Install

Grab a build from [Releases](https://github.com/ChisaAlter/Deepseek-Harness-Desktop/releases/latest). No local Node required.

| | |
| --- | --- |
| Windows x64 | `Deepseek-Harness-Desktop-Setup-*.exe` |
| macOS Apple Silicon | `Deepseek-Harness-Desktop-*-mac-arm64.dmg` |
| Intel Mac, Linux | [Run from source](#run-from-source) |

The macOS build is unsigned: right-click → Open, or run `xattr -cr /Applications/Deepseek-Harness-Desktop.app`.

## Features

- **Official UI** — Chat, tool calls, and approvals are `dsh web`. There is no custom chat page.
- **Git** — Switch branches, commit, push, and open a pull request from the title bar.
- **Files and terminal** — `Ctrl+\` opens the right column (Files / Diff / Browser / Agents); `` Ctrl+` `` opens the bottom terminal. A selection can join chat.
- **Models** — Thinking intensity for third-party models, vision fallback; the latest user message can be edited and resent.
- **Appearance** — Light / dark themes. Pick a wallpaper or Browse the gallery (categories, search, favorites; confirm crops to the window). Frost and pixelate stay on Appearance.
- **Extensions** — MCP, Skills, and plugins in Settings. The marketplace is the bundled [dsh-market](https://github.com/dsh-market/dsh-market) plugin (`dshmarket`). There is no standalone marketplace window.
- **Desktop** — Minimize to tray, auto-update. If Harness dies, the window returns to a failure page and restarts. If a user plugin blocks startup, the boot page can skip the plugin tree.

`Ctrl+,` opens Settings.

<table>
  <tr>
    <td align="center" width="50%"><img src="assets/screenshot-surfaces.jpg" alt="Chat and Files column" /></td>
    <td align="center" width="50%"><img src="assets/screenshot-wallpaper.jpg" alt="Wallpaper" /></td>
  </tr>
  <tr>
    <td align="center" width="50%"><img src="assets/screenshot-themes.jpg" alt="Theme library" /></td>
    <td align="center" width="50%"><img src="assets/screenshot-appearance.jpg" alt="Appearance settings" /></td>
  </tr>
</table>

## Run from source

Windows 10+ or macOS 14+ (Apple Silicon), Node 22.19+ / 24+, pnpm 11.

```powershell
git clone https://github.com/ChisaAlter/Deepseek-Harness-Desktop.git
cd Deepseek-Harness-Desktop
npm install
npm run setup:harness
npm start
```

The first `setup:harness` builds the vendored `vendor/deepseek-harness` — slow. Quit the installed app before a source launch; they share a single-instance lock.

## Development

Edit the UI in `vendor/deepseek-harness`. Follow the [design language](docs/design-language.en.md) and [motion](docs/motion.en.md). After changing client sources, run `pnpm run build:lib:client` there and restart the desktop app.

The current official baseline is `vendor/harness-upstream.json`: `0.1.0-rc.8` (`dsh-v0.1.0-rc.8` / `141eb6fef83422698aef7a981029e843e8161534`). The npx fallback is official `@deepseek-ai/dsh@0.1.0-rc.8` and does not include the titlebar, Git, surfaces column, or terminal drawer; those ship only on the source and packaged paths. SQLite session databases are incompatible with rc.7.

```powershell
npm test              # desktop unit tests
npm run sync:harness -- --ref dsh-v0.1.0-rc.8 --sha 141eb6fef83422698aef7a981029e843e8161534
npm run dist          # Windows installer
npm run dist:mac      # macOS installer (must run on macOS)
```

Push a `v*` tag that matches `package.json`; GitHub Actions builds the Windows and macOS installers.

## Community

Scan to join. Issues and PRs are welcome. Thanks to [Linux.do](https://linux.do).

## License

[MIT](LICENSE)
