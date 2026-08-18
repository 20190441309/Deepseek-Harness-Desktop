<p align="center">
  <img src="assets/icon.png" width="88" alt="Deepseek-Harness-Desktop" />
</p>

<h1 align="center">Deepseek-Harness-Desktop</h1>

<p align="center">
  DeepSeek Harness 官方 Web UI 的桌面客户端<br />
  下载安装即可使用，不用自己起 <code>dsh web</code>
</p>

<p align="center">
  中文 · <a href="README.en.md">English</a>
  &nbsp;·&nbsp;
  <a href="https://github.com/ChisaAlter/Deepseek-Harness-Desktop/releases/latest">下载</a>
  &nbsp;·&nbsp;
  <a href="https://github.com/deepseek-ai/deepseek-harness">DeepSeek Harness</a>
</p>

<p align="center">
  <a href="https://github.com/ChisaAlter/Deepseek-Harness-Desktop/releases/latest"><img src="https://img.shields.io/github/v/release/ChisaAlter/Deepseek-Harness-Desktop" alt="Release" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/ChisaAlter/Deepseek-Harness-Desktop" alt="License" /></a>
  <img src="https://img.shields.io/badge/Windows-x64-0A66C2" alt="Windows x64" />
  <img src="https://img.shields.io/badge/macOS-arm64-111111" alt="macOS arm64" />
</p>

<p align="center">
  <img src="assets/screenshot-home.jpg" alt="主界面" width="920" />
</p>

## 安装

到 [Releases](https://github.com/ChisaAlter/Deepseek-Harness-Desktop/releases/latest) 下载，装完不需要本机 Node。

| | |
| --- | --- |
| Windows x64 | `Deepseek-Harness-Desktop-Setup-*.exe` |
| macOS Apple Silicon | `Deepseek-Harness-Desktop-*-mac-arm64.dmg` |
| Intel Mac、Linux | [从源码运行](#从源码运行) |

macOS 安装包未签名：下载后右键打开，或执行 `xattr -cr /Applications/Deepseek-Harness-Desktop.app`。请不要安装已撤回的 v0.2.0。

## 功能

- **官方界面** — 对话、工具调用、审批就是 `dsh web`，没有另做一套聊天页。
- **Git** — 标题栏切分支、提交、推送、开变更请求。
- **文件与终端** — `Ctrl+\` 打开右栏（Files / Diff / Browser / Agents）；`` Ctrl+` `` 打开底栏终端，选区可送进对话。
- **模型** — 第三方思考强度、识图兜底；最新一条用户消息可改完再发。
- **外观** — 浅色 / 深色主题、背景图、毛玻璃。
- **扩展** — 设置里管理 MCP、技能和插件。插件市场来自 GitHub [`dsh-plugin`](https://github.com/topics/dsh-plugin)。
- **桌面** — 关闭进托盘、自动更新；Harness 挂了会回到故障页并自动重启。

`Ctrl+,` 打开设置。

<p align="center">
  <img src="assets/screenshot-surfaces.jpg" alt="对话与右栏" width="48%" />
  <img src="assets/screenshot-wallpaper.jpg" alt="背景图" width="48%" />
</p>
<p align="center">
  <img src="assets/screenshot-themes.jpg" alt="主题库" width="48%" />
  <img src="assets/screenshot-appearance.jpg" alt="外观设置" width="48%" />
</p>

## 从源码运行

需要 Windows 10+ 或 macOS 14+（Apple Silicon），Node 22.19+ / 24+，pnpm 11。

```powershell
git clone https://github.com/ChisaAlter/Deepseek-Harness-Desktop.git
cd Deepseek-Harness-Desktop
npm install
npm run setup:harness
npm start
```

第一次 `setup:harness` 会构建随仓库提供的 `vendor/deepseek-harness`，比较慢。安装版和源码启动会互相抢锁，开发前先退出已安装的应用。

## 开发

改界面请改 `vendor/deepseek-harness`，并遵守 [设计语言](docs/design-language.md) 和 [动效](docs/motion.md)。改完客户端源码后，在该目录执行 `pnpm run build:lib:client` 再重启桌面端。

```powershell
npm test              # 桌面壳单测
npm run sync:harness  # 拉取官方 Harness
npm run dist          # Windows 安装包
npm run dist:mac      # macOS 安装包（须在 macOS 上）
```

推送与 `package.json` 一致的 `v*` 标签，GitHub Actions 会出 Windows 和 macOS 安装包。

## 交流

<p align="center">
  <img src="assets/wechat-group.png" alt="交流群" width="240" />
</p>

扫码进群。Issue 和 PR 也欢迎。感谢 [Linux.do](https://linux.do)。

## 许可证

[MIT](LICENSE)
