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
- **Appearance** — Light / dark themes, wallpaper, glass.
- **Extensions** — MCP, Skills, and plugins in Settings. The marketplace is GitHub [dsh-plugin](https://github.com/topics/dsh-plugin).
- **Desktop** — Minimize to tray, auto-update. If Harness dies, the window returns to a failure page and restarts.

`Ctrl+,` opens Settings.

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

The current official baseline is `vendor/harness-upstream.json`: `0.1.0-rc.7` (`dsh-v0.1.0-rc.7` / `99f6f02fecdb7dff40c3fbc9470f5907c29f74ca`). The npx fallback is official `@deepseek-ai/dsh@0.1.0-rc.7` and does not include the titlebar, Git, surfaces column, or terminal drawer; those ship only on the source and packaged paths.

```powershell
npm test              # desktop unit tests
npm run sync:harness -- --ref dsh-v0.1.0-rc.7 --sha 99f6f02fecdb7dff40c3fbc9470f5907c29f74ca
npm run dist          # Windows installer
npm run dist:mac      # macOS installer (must run on macOS)
```

Push a `v*` tag that matches `package.json`; GitHub Actions builds the Windows and macOS installers.

## Community

Scan to join. Issues and PRs are welcome. Thanks to [Linux.do](https://linux.do).

## License

[MIT](LICENSE)
