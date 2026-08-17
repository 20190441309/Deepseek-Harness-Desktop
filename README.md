# Deepseek-Harness-Desktop

中文 · [English](README.en.md)

基于 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 官方 Web UI 的 Electron 桌面壳。

不重做聊天界面：窗口、托盘、工作区、API Key 和启动编排由 Electron 负责；对话、工具调用、审批仍是官方 `dsh web`。在思考强度、识图兜底、主题、Git / 终端 / 右栏、MCP 与技能上补了一点桌面能力。当前请用 [v0.2.3](https://github.com/ChisaAlter/Deepseek-Harness-Desktop/releases/tag/v0.2.3)。深度 GUI 爱好者，欢迎需求、建议和 PR。

<p align="center">
  <img src="assets/screenshot-home.jpg" alt="Deepseek-Harness-Desktop 主界面" width="920" />
</p>

## 安装

去 [v0.2.3](https://github.com/ChisaAlter/Deepseek-Harness-Desktop/releases/tag/v0.2.3) 下载安装包，装完不需要本机 Node。历史版本见 [Releases](https://github.com/ChisaAlter/Deepseek-Harness-Desktop/releases)。请不要安装已撤回的 v0.2.0。

- Windows x64：`Deepseek-Harness-Desktop-Setup-0.2.3.exe`
- macOS Apple Silicon（arm64）：`Deepseek-Harness-Desktop-0.2.3-mac-arm64.dmg`（未签名：下载后右键 → 打开；或执行 `xattr -cr /Applications/Deepseek-Harness-Desktop.app`）
- Intel Mac 与 Linux 请从源码运行

## 界面

标题栏带 Git：有仓库时可以切分支、Commit / Push / 开变更请求。`Ctrl+\` 打开右栏（Files / Diff / Browser / Agents），Ctrl+` 打开底栏终端。文件、Git 和命令都锁在当前工作区里。

<p align="center">
  <img src="assets/screenshot-surfaces.jpg" alt="标题栏 Git、文件栏和终端" width="920" />
</p>

### 第三方思考强度

设置 → 模型 → 编辑自定义提供方，给模型勾上思考强度。保存后，输入栏的模型菜单会出现「推理等级」。

<p align="center">
  <img src="assets/screenshot-thinking-settings.jpg" alt="设置里为第三方模型勾选思考强度" width="920" />
</p>

<p align="center">
  <img src="assets/screenshot-thinking-chat.jpg" alt="输入栏选择推理等级" width="920" />
</p>

### 识图模型

设置 → 模型 → 识图模型，选一个支持图片输入的模型。主模型不能识图时，会先调用它识别图片内容，再把描述交给主模型。

<p align="center">
  <img src="assets/screenshot-vision-settings.jpg" alt="设置里配置识图模型" width="920" />
</p>

<p align="center">
  <img src="assets/screenshot-vision-chat.jpg" alt="主模型不能识图时由识图模型先看图" width="920" />
</p>

### 主题与背景

设置 → 外观。浅色 / 深色 / 跟随系统分开选；主题库里每张卡都有浅、深两半，点哪半用哪半。可以创建、复制、编辑、导入导出自己的主题。

背景图铺在整个界面后面，设好之后可以调毛玻璃、像素化和玻璃透明度：数值越低，侧栏、对话框和输入框越通透。

<p align="center">
  <img src="assets/screenshot-theme-library.jpg" alt="外观页的主题库" width="920" />
</p>

<p align="center">
  <img src="assets/screenshot-theme-wallpaper-settings.jpg" alt="背景图、毛玻璃、像素化和玻璃透明度" width="920" />
</p>

<p align="center">
  <img src="assets/screenshot-theme-wallpaper-chat.jpg" alt="铺了背景图之后的对话界面" width="920" />
</p>

### MCP 与技能

设置 → MCP、设置 → 技能；文件菜单也有入口。可增删改、启停。MCP 写入 `~/.dsh/mcp-servers.yaml`，技能写入 `~/.dsh/skills`，保存后立即生效。

<p align="center">
  <img src="assets/screenshot-mcp.jpg" alt="设置里的 MCP 服务器页" width="920" />
</p>

<p align="center">
  <img src="assets/screenshot-skills.jpg" alt="设置里的技能页" width="920" />
</p>

## 特性

- **无边框窗口 + 自绘标题栏**：可拖动、双击最大化；背景跟随主题
- **自动启动 Harness**：探测 `127.0.0.1:3080`，清掉上次残留，被占用就换空闲端口
- **三重启动链**：`vendor/deepseek-harness` 构建产物 → 本机 `dsh` → `npx @deepseek-ai/dsh`
- **工作区自动注册**：启动时通过 RPC 把工作区目录注册进 Harness
- **设置就是 Harness 设置**（`Ctrl+,`）：模型、插件、MCP、技能、关于、检测更新都在官方设置里
- **托盘常驻**：显示窗口、设置、重启 Harness、退出。设置 → 通用可选择关闭窗口时最小化到托盘或直接退出
- **自动更新**：有新版本时设置按钮旁出现「有新版本」；设置 → 关于也可手动检查 GitHub Releases
- **API Key 独立存放**：`config.json` 与 `credentials.json` 分开，Key 通过 `DEEPSEEK_API_KEY` 注入 dsh 进程
- **插件市场**：设置 → 插件 →「插件市场」。目录只认 GitHub [`dsh-plugin`](https://github.com/topics/dsh-plugin) 话题。点安装会打开空白会话并预填草稿，由你自己发送；卸载仍是一键
- **编辑并重新发送**：最新一条用户消息旁有铅笔；确认后在子会话里发出，原会话不动
- **Harness 自动恢复**：主界面起来后 `dsh` 意外退出，会回到故障页并有限次重启；设置 → 通用可改策略
- **完整 VT 终端**：底栏抽屉与右栏 Terminal 各自拥有 PTY（Windows ConPTY），选区可加入对话

手机远程入口本版隐藏，能力与文档仍在，见 [`mobile/README.md`](mobile/README.md)。

## 快捷键

| 操作 | 方式 |
| --- | --- |
| 设置 | `Ctrl+,` 或托盘菜单 |
| MCP | 文件 → MCP…，或设置 → MCP |
| 技能 | 文件 → 技能…，或设置 → 技能 |
| 插件市场 | 设置 → 插件 →「插件市场」；`Ctrl+Shift+M` |
| 终端抽屉 | Ctrl+` 或标题栏终端按钮 |
| 右边栏 | `Ctrl+\` 或标题栏右栏按钮 |
| 重启 Harness | `Ctrl+Shift+R` |
| 重新加载界面 | `Ctrl+R` |
| 开发者工具 | `Ctrl+Shift+I` |

## 从源码跑

Windows 10+ 或 macOS 14+（Apple Silicon），Node 22.19+ / 24+，pnpm 11。

```powershell
git clone https://github.com/ChisaAlter/Deepseek-Harness-Desktop.git
cd Deepseek-Harness-Desktop
npm install
npm run setup:harness
npm start
```

Harness 源码已随仓库自带（`vendor/deepseek-harness`），第一次 `setup:harness` 装依赖并完整构建，比较慢；之后 `npm start` 就行。本机没有 Electron 的话，把 `ELECTRON_PATH` 指到 `electron.exe`。安装版和源码启动共用同一个 `appId`，会抢单例锁：开发前先退出已安装的 Deepseek-Harness-Desktop。

改了 `packages/client/*/src` 之后要在 `vendor/deepseek-harness` 里跑 `pnpm run build:lib:client`（或至少编对应包的 `lib/client.js`），只编 `apps/web/dist` 看不到布局和设置页改动。桌面壳单测门槛是 `npm test`。

## 工作原理

官方源码固定在 `vendor/deepseek-harness`，启动时跑构建出来的 `dsh web`（默认 `127.0.0.1:3080`）。服务就绪后窗口加载 Web UI，并把工作区注册进去。

第三方 / 自定义供应商走 pi-ai 适配。模型上可以勾思考强度，输入栏里就能选。主模型不支持图片时，可指定识图模型先看图。外观写在 `$DSH_HOME/settings.yaml` 的 `ui-theme` 分节。

改界面就改 `vendor/deepseek-harness`，那个目录里 `pnpm run build`，再重启桌面端。Harness 还是开发者预览，随时可能变。

### 二次开发与上游同步

`vendor/deepseek-harness` 是 [git subtree](https://git-scm.com/book/en/v2/Git-Tools-Advanced-Merging#_subtree_merge)：

- **设计语言**：任何 UI / 布局 / 前端改动必须遵守官方 `dsh web` 的样式，见 [docs/design-language.md](docs/design-language.md)。不要给桌面壳另做一套皮肤。启动页仪器风见 [桌面启动页](docs/design-language.md#桌面启动页)，不得扩散。动效见 [docs/motion.md](docs/motion.md)。
- **二次开发**：直接改 `vendor/deepseek-harness` 里的文件，和本仓库其他代码一起正常提交即可。
- **拉取官方更新**：`npm run sync:harness`。只有双方改了同一处才需要手动解决冲突。同步后跑 `npm run setup:harness` 重新构建。

## 打包与发布

```powershell
npm run dist      # Windows NSIS
npm run dist:mac  # macOS Apple Silicon DMG（需在 macOS 上跑）
```

产物在 `dist/`。本地打包要把官方源码搬进安装包，很慢；推荐用 GitHub Actions（`.github/workflows/release.yml`）：推送 `v*` 标签（须与 `package.json` 版本一致）会构建 Windows NSIS 与 macOS arm64 DMG。Windows 构建成功即可发版。

## 微信群

<div>

![Deepseek-Harness-Desktop 交流群](assets/wechat-group.png)

扫码进群，聊用法、踩坑和需求。

</div>

## 社区鸣谢

- [Linux.do](https://linux.do)

## 许可证

[MIT](LICENSE)
