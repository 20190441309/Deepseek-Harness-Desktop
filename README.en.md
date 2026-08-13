# Deepseek-Harness-Desktop

[中文](README.md) · English

An Electron desktop shell on top of [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness).

A few small tweaks around third-party thinking intensity and the like. I just really like GUIs. Issues, suggestions, and PRs are all welcome.

<p align="center">
  <img src="assets/screenshot-home.png" alt="Deepseek-Harness-Desktop" width="920" />
</p>

## WeChat group

<div align="center">

![Deepseek-Harness-Desktop WeChat group](assets/wechat-group.png)

</div>

## Run

Windows 10+, Node 22.19 / 24+, pnpm 11, and a local Electron. Get an API key from [DeepSeek](https://platform.deepseek.com/).

```powershell
git clone https://github.com/ChisaAlter/Deepseek-Harness-Desktop.git
cd Deepseek-Harness-Desktop
npm install
npm run setup:harness
npm start
```

First `setup:harness` clones and builds upstream. Slow. After that, `npm start`. If Electron isn't found, point `ELECTRON_PATH` at `electron.exe`.

`Ctrl+,` opens Settings. Closing the window goes to the tray.

## How it's wired

No custom chat UI. Electron owns the window, tray, workspace, and API key. Chat, tools, and approvals stay the official Web UI.

Upstream lives in `vendor/deepseek-harness`. We boot the built `dsh web` on `127.0.0.1:3080`. If that isn't built, it falls back to a local `dsh` or `npx`.

Custom / third-party providers go through the pi-ai adapter. You can tick thinking intensity on a model (low / medium / high / xhigh / max); that lands in `reasoningEfforts` and shows up in the composer. Official DeepSeek defaults are left alone.

To change the UI, edit `vendor/deepseek-harness`, run `pnpm run build` there, restart. Harness is still a developer preview.

Installer: `npm run dist`.

## License

[MIT](LICENSE)
