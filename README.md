# Deepseek-Harness-Desktop

中文 · [English](README.en.md)

基于 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的 Electron 桌面端。

对第三方思考强度等做了一点点优化。深度 GUI 爱好者。欢迎提交各种需求、建议和 PR。

<p align="center">
  <img src="assets/screenshot-home.png" alt="Deepseek-Harness-Desktop" width="920" />
</p>

## 微信群

<div align="center">

![Deepseek-Harness-Desktop 交流群](assets/wechat-group.png)

</div>

## 跑起来

Windows 10+，Node 22.19 / 24+，pnpm 11，本机要有 Electron。API Key 去 [DeepSeek](https://platform.deepseek.com/) 申请。

```powershell
git clone https://github.com/ChisaAlter/Deepseek-Harness-Desktop.git
cd Deepseek-Harness-Desktop
npm install
npm run setup:harness
npm start
```

第一次 `setup:harness` 会拉官方源码并构建，会慢。之后 `npm start` 就行。找不到 Electron 的话，把 `ELECTRON_PATH` 指到 `electron.exe`。

`Ctrl+,` 是设置。关窗口默认进托盘。

## 技术路线

没打算重做一套聊天界面。Electron 只负责窗口、托盘、工作区、API Key；对话、工具、审批还是官方 Web UI。

官方源码在 `vendor/deepseek-harness`。启动时跑构建出来的 `dsh web`，默认 `127.0.0.1:3080`。源码没构建好才会退回本机 `dsh` 或 `npx`。

第三方 / 自定义供应商走 pi-ai 适配。模型上可以勾思考强度（low / medium / high / xhigh / max），写进 `reasoningEfforts`，输入栏里就能选。官方默认体验基本不动，只在这类地方补了一点。

改界面就改 `vendor/deepseek-harness`，那个目录里 `pnpm run build`，再重启桌面端。Harness 还是开发者预览，随时可能变。

打安装包：`npm run dist`。

## 许可证

[MIT](LICENSE)
