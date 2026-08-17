# Deepseek-Harness-Desktop

中文 · [English](README.en.md)

基于 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 官方 Web UI 的 Electron 桌面壳。

不重做聊天界面：Electron 只负责窗口、托盘、工作区、API Key 和启动编排，对话、工具调用、审批还是官方 `dsh web`。思考强度、识图兜底、主题、Git / 终端 / 右栏、MCP 与技能这类地方补了一点。当前请用 [v0.2.2](https://github.com/ChisaAlter/Deepseek-Harness-Desktop/releases/tag/v0.2.2)。[v0.2.0](https://github.com/ChisaAlter/Deepseek-Harness-Desktop/releases) 因启动错误已撤回，不要再装。v0.2.1 因发布流水线失败从未上线。深度 GUI 爱好者，欢迎各种需求、建议和 PR。

<p align="center">
  <img src="assets/screenshot-home.png" alt="Deepseek-Harness-Desktop" width="920" />
</p>

0.2.2 相对 0.1.3：

1. 设置 → MCP、设置 → 技能：增删改、启停；MCP 写入 `~/.dsh/mcp-servers.yaml`，技能写入 `~/.dsh/skills`。文件菜单也有入口。
2. 标题栏 Git、完整 VT 终端、纯右边栏：提交 / 推送 / 变更请求、分支切换与新建（可搜索）、ANSI 终端（xterm；选区可加入对话）、Files（搜索与保存）/ Diff / Browser / Agents。文件与命令都锁在当前工作区内。标题栏按钮或快捷键切换：终端抽屉是 Ctrl+`，右栏是 `Ctrl+\`。
3. 最新一条用户消息可就地编辑后重新发送：点铅笔改那条气泡，确认后才在子会话里发出，原会话不动。编辑第一条消息或空白 fork 时，子会话标题跟新提示走，不会钉成「父标题 (1)」。
4. Harness 运行中意外退出后自动回到故障页并有限次重启；设置 → 通用可开关自动恢复、次数和间隔。工具调度失败留下的残缺会话，下次发送时也会自动补齐，不再永久卡死。
5. 设置 → 通用可选择关闭窗口时最小化到托盘还是直接退出；退出会停掉本机 Harness，并显示跟随当前主题的「关闭中」遮罩。
6. 插件市场安装改为打开空白会话并预填草稿，由你自己发送；卸载仍是一键。
7. 手机远程办公本版隐藏入口，将在下一版本发布；底层能力与文档保留，见下文「远程访问」。

0.2.2 还修了撤回的 0.2.0：Web UI 起来后标题栏除最小化 / 最大化 / 关闭外点不了；单个 MCP 子进程失败不再拖垮整个 Host。标题栏变窄时 Git / 会话标题会折叠；终端抽屉首次打开能正确适应尺寸并聚焦。

一直可用：第三方思考强度、识图模型兜底、自定义主题和背景图。

也欢迎有需求的朋友来提需求，或者提 PR。

## 特性

- **无边框窗口 + 自绘标题栏**：可以拖动、双击最大化，最小化 / 最大化 / 关闭按钮齐全，标题栏背景跟随主题
- **自动启动 Harness**：启动时检测 `127.0.0.1:3080` 端口——杀掉上次残留的 dsh 进程；被其他程序占用就自动跳到空闲端口
- **三重启动链**：优先跑 `vendor/deepseek-harness` 构建产物 → 本机 `dsh` → `npx @deepseek-ai/dsh`，总有一条能起来
- **工作区自动注册**：启动时通过 RPC 把工作区目录注册进 Harness，不用手动建
- **设置就是 Harness 设置**（`Ctrl+,`）：模型、插件、MCP、技能、关于、检测更新和在线安装都在官方设置里
- **托盘常驻**：显示窗口、设置、重启 Harness、退出。设置 → 通用 →「关闭窗口时」可选最小化到托盘（默认）或直接退出；退出会先停本机 Harness，全屏「关闭中」遮罩跟随当前浅/深主题
- **自动更新**：有新版本时设置按钮旁出现绿色"有新版本"按钮，点击即可在线更新；设置 → 关于里也可手动检查 GitHub Releases
- **API Key 独立存放**：`config.json` 与 `credentials.json` 分开，Key 通过 `DEEPSEEK_API_KEY` 注入 dsh 进程
- **第三方思考强度**：自定义 / 第三方模型可勾 Low / Medium / High / Very High / Extreme，输入栏里就能切推理等级
- **识图模型兜底**：主模型（比如 DeepSeek）不支持图片时，先由专门的识图模型看图，再把描述交给主模型
- **主题与背景图**：设置 → 外观里选内置主题或自己做一套；可铺背景图，毛玻璃、像素化、玻璃透明度都能调。对话框、菜单和模型名切换走同一套进出场动效，系统开了「减少动效」会自动关掉。
- **插件市场**：在设置 → 插件 →「插件市场」里，和插件配置、插件列表并排。菜单 / 托盘 / 标题栏 / `Ctrl+Shift+M` 会打开这一页。目录只认 GitHub [`dsh-plugin`](https://github.com/topics/dsh-plugin) 话题，按界面、工作流、工具、通知、开发、学习分类；点安装会关闭设置、打开空白会话并预填「帮我安装 …」，由你自己发送，Agent 通过 `install_dsh_plugin` 调用官方 `dsh plugin --profile web add github:owner/repo`，成功后重启 Harness。卸载仍是设置里一键。git 安装会在本机执行仓库的 prepare 脚本，只装你信任的插件。GitHub API 被限流时可把 Token 写进这一页。
- **MCP 与技能**：设置 → MCP、设置 → 技能；文件 → MCP… / 技能… 也会打开对应页。可增删改、启停；MCP 写入 `~/.dsh/mcp-servers.yaml`，技能写入 `~/.dsh/skills`，保存后立即生效。
- **远程办公（下一版本）**：本版已隐藏远程入口（侧栏「远程」按钮），设置与配对能力保留，下一版本恢复发布。开启后桌面端出站连接中继，展示配对二维码。手机扫码打开官方 `dsh web`（竖屏覆盖层侧栏，横屏常驻工作区列表）。已绑定设备可单独解绑。说明见 [`mobile/README.md`](mobile/README.md)。
- **编辑并重新发送**：最新一条用户消息旁有铅笔；点了会把那条气泡变成可编辑输入，确认后才在该消息之前分出子会话并发送修改后的文本，原会话和旧回答都保留。
- **Harness 自动恢复**：主界面起来之后 `dsh` 意外退出，窗口立刻回到故障页，默认最多自动重启 3 次（间隔 1 / 2 / 4 秒），可取消或立刻重启。设置 → 通用可改策略。崩溃期间手机远程不再代理已经死掉的端口。
- **工具结果配对恢复**：调度失败留下「有工具调用、没有结果」的残缺会话，下次发送会自动补齐，不再被提供商永久拒绝。
- **标题栏 Git 操作**：有 Git 仓库的工作区里，标题栏出现 Commit / Commit & push / Push / 变更请求按钮与下拉菜单；无 Git 或非仓库时自动禁用。状态在窗口聚焦、操作完成后自动刷新。
- **完整 VT 终端**：底栏终端抽屉与右栏 Terminal 各自拥有 PTY 会话表（Windows ConPTY），基于 xterm 的完整 ANSI/VT。选区可复制、加入对话（没有会话时禁用）、打开 URL 或工作区路径；⌘/Ctrl-点击同样生效。最大化只还原底栏抽屉高度，右栏 Terminal 没有单独最大化。
- **纯右边栏**：标题栏开关打开右栏。Files 可按名搜索、编辑保存（未保存草稿刷新后仍在，关 Tab 会确认）；Browser 可后退/前进/刷新/DevTools/系统浏览器/发现本机端口，切 Tab 不关访客页；Diff 分工作区与分支范围；Agents 列出子会话与后台任务。文件、Git、命令锁在工作区根；预览只允许本机回环且隔离会话，不带 API Key。

### 第三方思考强度

设置 → 模型 → 编辑自定义提供方，给模型勾上思考强度。保存后，输入栏的模型菜单会出现「推理等级」。

<p align="center">
  <img src="assets/screenshot-thinking-settings.png" alt="设置里为第三方模型勾选思考强度" width="920" />
</p>

<p align="center">
  <img src="assets/screenshot-thinking-chat.png" alt="输入栏选择推理等级" width="920" />
</p>

### 识图模型

设置 → 模型 → 识图模型，选一个支持图片输入的模型。主模型不能识图时，会先调用它识别图片内容，再把描述交给主模型。

<p align="center">
  <img src="assets/screenshot-vision-settings.png" alt="设置里配置识图模型" width="920" />
</p>

<p align="center">
  <img src="assets/screenshot-vision-chat.png" alt="主模型不能识图时由识图模型先看图" width="920" />
</p>

### 主题与背景

设置 → 外观。浅色 / 深色 / 跟随系统分开选；主题库里每张卡都有浅、深两半，点哪半用哪半。可以创建、复制、编辑、导入导出自己的主题，强调色会铺到发送按钮、用户气泡和侧栏选中项。

背景图铺在整个界面后面，设好之后可以调毛玻璃、像素化和玻璃透明度：数值越低，侧栏、对话框和输入框越通透。

<p align="center">
  <img src="assets/screenshot-theme-library.png" alt="外观页的主题库：内置主题和自定义主题" width="920" />
</p>

<p align="center">
  <img src="assets/screenshot-theme-wallpaper-settings.png" alt="背景图、毛玻璃、像素化和玻璃透明度" width="920" />
</p>

<p align="center">
  <img src="assets/screenshot-theme-wallpaper-chat.png" alt="铺了背景图之后的对话界面" width="920" />
</p>

### 远程访问（下一版本）

本版已隐藏远程入口，以下能力将在下一版本随入口一起恢复发布。

设置 → 通用 →「远程访问」。开启后桌面端出站连接中继，弹出配对二维码。手机用系统相机扫码，配对成功后打开官方 Web 页：竖屏会话占满屏、工作区在左抽屉里；横屏左边工作区列表常驻。配对密钥只在 `#offer=` 里，页面不会要求手输令牌。已绑定设备可以单独解绑，不必轮换二维码。模型密钥、插件市场和远程配对仍在桌面端。`dsh web` 始终只听 `127.0.0.1`，远程也调不了设置、凭据这类特权接口。

### 编辑并重新发送

最新一条已发送的用户消息旁会出现铅笔。点击后那条气泡变成可编辑输入；取消恢复原文，发送则从该消息之前分出子会话并提交修改后的文本。原会话和旧回答都保留。正在生成、或消息里带图片时按钮不可用。

### Harness 自动恢复

主界面已经起来之后，如果 `dsh` 意外退出，窗口立刻回到故障页，显示退出原因和下次重试倒计时。默认最多自动重启 3 次（间隔 1 / 2 / 4 秒），可以取消本轮或立刻重启。冷启动配置错误不会循环重试。设置 → 通用 →「Harness 自动恢复」可开关、改次数和基础延迟。崩溃期间手机远程不再代理已经死掉的端口。

### 标题栏 Git、终端与右边栏

有 Git 仓库的工作区里，标题栏提供 Commit / Commit & push / Push / 变更请求。底栏终端抽屉和右栏 Terminal 各自拥有 PTY，完整 ANSI/VT；选区可加入对话（无会话时禁用）。标题栏开关打开右栏后，Files 可搜索并保存、Browser 可导航并保持访客页、Diff 可看工作区或分支、Agents 可读任务状态。

## 安装

只想用的话，去 [v0.2.2](https://github.com/ChisaAlter/Deepseek-Harness-Desktop/releases/tag/v0.2.2) 下载安装包，装完不需要本机 Node 环境。历史版本见 [Releases](https://github.com/ChisaAlter/Deepseek-Harness-Desktop/releases)。

- Windows x64：`Deepseek-Harness-Desktop-Setup-0.2.2.exe`
- macOS Apple Silicon（arm64）：`Deepseek-Harness-Desktop-0.2.2-mac-arm64.dmg`（未签名：下载后右键 → 打开；或执行 `xattr -cr /Applications/Deepseek-Harness-Desktop.app`）
- Intel Mac 与 Linux 请从源码运行

## 从源码跑

Windows 10+ 或 macOS 14+（Apple Silicon），Node 22.19+ / 24+，pnpm 11。

```powershell
git clone https://github.com/ChisaAlter/Deepseek-Harness-Desktop.git
cd Deepseek-Harness-Desktop
npm install
npm run setup:harness
npm start
```

Harness 源码已随仓库自带（`vendor/deepseek-harness`），第一次 `setup:harness` 装依赖并完整构建，比较慢；之后 `npm start` 就行。本机没有 Electron 的话，把 `ELECTRON_PATH` 指到 `electron.exe`。桌面壳单测门槛是 `npm test`（不启动 Electron）；改关闭行为、托盘或主题遮罩后先跑它。安装版和源码启动共用同一个 `appId`，会抢单例锁：开发前先退出已安装的 Deepseek-Harness-Desktop。改了 `packages/client/*/src` 之后要在 `vendor/deepseek-harness` 里跑 `pnpm run build:lib:client`（或至少编对应包的 `lib/client.js`），只编 `apps/web/dist` 看不到布局和设置页改动。

### 日常使用

| 操作 | 方式 |
| --- | --- |
| 设置 | `Ctrl+,` 或托盘菜单 |
| MCP | 文件 → MCP…，或设置 → MCP |
| 技能 | 文件 → 技能…，或设置 → 技能 |
| 插件市场 | 设置 → 插件 →「插件市场」；`Ctrl+Shift+M`、托盘或标题栏也会打开这一页 |
| 终端抽屉 | Ctrl+` 或标题栏终端按钮 |
| 右边栏 | `Ctrl+\` 或标题栏右栏按钮 |
| 重启 Harness | `Ctrl+Shift+R` |
| 重新加载界面 | `Ctrl+R` |
| 开发者工具 | `Ctrl+Shift+I` |
| 关闭窗口 | 设置 → 通用 →「关闭窗口时」：默认最小化到托盘；选「直接退出」会停掉本机服务并显示跟随主题的关闭中遮罩 |

## 工作原理

官方源码固定在 `vendor/deepseek-harness`，启动时跑构建出来的 `dsh web`（默认 `127.0.0.1:3080`）。启动顺序：集成源码没构建好 → 退回本机 `dsh` → 再退回 `npx`。服务就绪后窗口加载 Web UI，并把工作区注册进去。

第三方 / 自定义供应商走 pi-ai 适配。模型上可以勾思考强度（low / medium / high / xhigh / max），写进 `reasoningEfforts`，输入栏里就能选。主模型不支持图片时，可指定识图模型先看图再交给主模型。外观页的主题家族、背景图和玻璃透明度写在 `$DSH_HOME/settings.yaml` 的 `ui-theme` 分节。官方默认体验基本不动，只在这类地方补了一点。

改界面就改 `vendor/deepseek-harness`，那个目录里 `pnpm run build`，再重启桌面端。Harness 还是开发者预览，随时可能变。

### 二次开发与上游同步

`vendor/deepseek-harness` 是 [git subtree](https://git-scm.com/book/en/v2/Git-Tools-Advanced-Merging#_subtree_merge)：

- **设计语言**：任何 UI / 布局 / 前端改动必须遵守官方 `dsh web` 的样式，见 [docs/design-language.md](docs/design-language.md)。不要给桌面壳另做一套皮肤。启动页仪器风见 [桌面启动页](docs/design-language.md#桌面启动页)，不得扩散。按键、弹窗、菜单的动效规范与使用对照见 [docs/motion.md](docs/motion.md)。
- **二次开发**：直接改 `vendor/deepseek-harness` 里的文件，和本仓库其他代码一起正常提交即可，不需要维护补丁文件。
- **拉取官方更新**：`npm run sync:harness`（等价于 `git subtree pull --squash`）。git 会做三方合并——上游改动和本地定制自动融合，只有双方改了同一处才需要手动解决冲突，解决后 `git add` + `git commit` 完成合并。同步后跑 `npm run setup:harness` 重新构建。
- **查看本地定制**：`git log --oneline -- vendor/deepseek-harness` 里非 `Sync/Squashed` 的提交就是二次开发历史；每次上游快照的提交信息里都带 `git-subtree-split`（上游 commit SHA），可用来对比。

## 打包与发布

本地打包：

```powershell
npm run dist      # Windows NSIS
npm run dist:mac  # macOS Apple Silicon DMG（需在 macOS 上跑）
```

产物在 `dist/`：Windows 是 NSIS 安装包（`Deepseek-Harness-Desktop-Setup-x.y.z.exe`），macOS 是 `npm run dist:mac` 产出的 Apple Silicon DMG。打包时会把 `vendor/deepseek-harness` 解引用复制进 `resources/`，并捆绑一个 Node 可执行文件——装完不依赖本机 Node 环境。安装包里的 Web UI 若想用官方 Web UI，需要 dsh 构建产物齐全（`apps/cli/lib/bin.js` + `apps/web/dist/index.html`）。

### CI 打包（推荐）

本地打包要把 1.4GB 的官方源码搬进安装包，很慢。用 GitHub Actions（`.github/workflows/release.yml`）在云端构建：

- **PR / 推 main**：`.github/workflows/test.yml` 跑 Windows / macOS 桌面单测、vendor GUI 门禁，以及 Windows 源码 Electron 冒烟
- **手动构建**：Actions 页 → Build installers → Run workflow；打包前同样先跑 `npm test`，Windows / macOS 安装包在 artifacts 里下载
- **自动发布**：推送 `v*` 标签（如 `v0.2.2`）自动构建 Windows NSIS 与 macOS arm64 DMG。Windows 构建成功即可发版；macOS 失败不再吞掉 Windows 安装包。tag 必须与 `package.json` 版本一致。

发布到 GitHub Releases 后，应用内「检查更新」就能发现并下载新版本。

## 微信群

<div>

![Deepseek-Harness-Desktop 交流群](assets/wechat-group.png)

扫码进群，聊用法、踩坑和需求。

</div>

## 社区鸣谢

- [Linux.do](https://linux.do)

## 许可证

[MIT](LICENSE)
