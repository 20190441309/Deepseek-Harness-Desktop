# Agent Note: 桌面 surfaces 栏、标题栏尾簇与窗口控件避让

Status: implemented

[English](2026-08-14-desktop-surfaces-and-titlebar.md) | 中文

> 范围：已交付的四栏 AppFrame、`shell.titlebar.trailing` 列表 slot、桌面 `git` / `pty` / `preview` IPC，以及按实测宽度避让窗口控件。组合规则见 [slot 体系标准](2026-07-22-slot-type-chain-implementation.md)；加载链与对象层见 [Web 客户端架构 note](2026-07-19-gui-web-client-architecture.md)。本 note 不取代那些决策。

## 问题

桌面壳需要 T3code 风格的 Git、底栏终端和最右侧 surfaces 栏，同时不能移动 Inspect，也不能重做左侧栏。无边框窗口还要保证不断变宽的标题栏尾簇不与自绘的最小化 / 最大化 / 关闭按钮重叠。

## 决策

AppFrame 是四栏：`sidebar | conversation | details | surfaces`，外加只位于会话栏下方的终端抽屉。共享标题栏行落在会话栏与详情栏上；surfaces 跨越所有行直到窗口顶部；侧栏仍通高，顶部保留字标行。关闭的 `details` 与 `surfaces` 宽度为 0。让步顺序是先把 surfaces 压到下限，再压 details，再派生关闭 surfaces，再派生关闭 details；侧栏不让步。`ctx.layout` 对 surfaces 和抽屉的写入与 details 相互独立：标题栏开关从不打开或关闭详情栏，关闭其中一栏也不会关闭另一栏。

标题栏尾簇是布局拥有的列表 slot `shell.titlebar.trailing`，包装为 `#dsh-shell-titlebar-trailing`。贡献方通过 [slot 声明注入](2026-08-05-slot-declaration-injection.md) 注册。从左到右：Session log（`id: 'session-log-download'`，`order: 10`）、Git（`id: 'git-actions'`，`order: 20`）、面板开关（`id: 'panel-toggles'`，`order: 40`），然后是 Electron 窗口控件。开关只写入 `toggleTerminalDrawer` 和 `toggleSurfaces`。Session log 仍是原来的下载控件；仅在当前有会话时渲染。

Harness 客户端插件拥有 UI。Electron 只暴露 `window.shell.git*`、`window.shell.pty*` 和 `window.shell.preview*`；注入脚本不绘制 Git、终端或右侧栏。底栏抽屉与 Terminal surface 各自拥有面向工作区 cwd 的 PTY 会话表；在一侧打开的窗格不会出现在另一侧。五个 surface 是 Browser、Terminal、Files、Diff 和 Agents。在桌面应用之外，Git IPC 为空操作，Browser 卡禁用。

`reservedRight()` 等于窗口控件宽度加上实测的 `#dsh-shell-titlebar-trailing` 宽度再加一段簇间距；该宽度为 0 时只保留控件宽度。注入脚本发布 `--dsh-wco-pad`（完整避让）和 `--dsh-wco-controls`（仅窗口控件）。AppFrame 有一行共享标题栏网格（`auto` + 主体 + 抽屉）。会话栏页头与滚动主体是该行对的 subgrid 项（`ConversationRoot` 为 `display: contents`）。详情栏占用主体行，因此分割线和占用者从标题栏带下方开始。surfaces 跨越所有网格行直到窗口顶部。surfaces 打开时，尾簇只占第 2–3 列（`margin-right: 8px`），Session log、Git 和面板开关停在第 4 列之前；窗口控件通过 surfaces 标签栏上的 `--dsh-wco-controls` 避让（ui-surfaces）。surfaces 关闭时，尾簇伸到右缘（`margin-right: var(--dsh-wco-controls, var(--dsh-wco-pad))`）。尾簇是该标题栏行的网格项（`justify-self: end`），不是盖在栏内容上的 overlay。手机与 compact-header 框架隐藏尾簇；关闭的列宽度为 0 且不画分割线，因此不会留下空洞。注入脚本是可重复执行的 IIFE：对同一文件的第二次 `executeJavaScript` 不得抛错。可供 Node require 的辅助函数放在 `src/main/harness-chrome-metrics.js`。

## 备选方案

**在 `harness-chrome-inject.js` 里绘制 Git、终端或右侧栏。** 该文件会执行两次（`dom-ready` 然后 `did-finish-load`）；顶层绑定会抛错，catch 会把窗口涂成白色。桌面 chrome 也没有 slot、locale 或 store（存储）座位。

**用 surfaces 替换 details 栏，或让标题栏开关驱动 details。** Inspect、轨迹表的 TOOL 检查器和现有的详情开闭仍属于 `details`。共用一个开关会把两列耦合在一起。

**整段拷贝 T3code 的 Ghostty / Effect / zustand 右侧栏栈。** 客户端已经通过 slot 和 `defineStore` 组合。第二套状态栈会重复所有权，并破坏四份 props 规则。

**把尾簇绝对定位在框架上，再用 `margin-top` inset surfaces。** overlay 会压在空态卡片和 Tab 上；56px 的列 spacer 会在右栏上方留出空洞，而会话栏仍有自己的页头。surfaces 通到窗口顶部；该列打开时尾簇停在第 4 列之前，因此不会压住标签栏。

**用 `--dsh-wco-pad` 定位尾簇。** pad 包含尾簇自身宽度，每次测量都会把尾簇推向左侧。`--dsh-wco-controls` 才是仅窗口控件的 inset。

**用写死的尾簇宽度代替实测 `#dsh-shell-titlebar-trailing`。** Session log、Git 和开关会随 locale、状态和占用变化宽度。常量要么挡住窗口控件，要么留下永久空洞。

## 影响

Web 组合与桌面窗口共用同一批客户端插件；Electron 是 IPC 宿主，不是第二棵 UI 树。details 与 surfaces 可以各自开闭。窗口控件避让跟随实时尾簇，因此新增标题栏占用者不必再改一处 inset 常量。

注入脚本保持为封闭的 chrome IIFE。需要新标题栏控件的贡献方以带 `order` 的方式注册到 `shell.titlebar.trailing`，不要把 Node 辅助函数写进该文件。

本仓库的桌面 CI 只有 `.github/workflows/release.yml` 里的 Electron 安装包工作流。该工作流运行 `npm ci` 并打包 Windows 安装包；它不运行 harness 的 `test`、`test:gui`、`test:coverage`、`typecheck`、`lint` 或 `doc-sync`。新的客户端包在本地仍受 harness 的逐文件 100% 覆盖率门槛约束，对真正不可达的分支使用 `/* v8 ignore -- <reason> */`。

用户终端在会话栏抽屉和 Terminal surface 中都是 `@xterm/xterm` VT 模拟器。

## 测试

各包套件钉住让步、store 动作、标题栏注入 / dispose（资源释放）、Git 状态、独立 PTY 所有权，以及五卡空态。`src/main/harness-chrome-inject.test.js` 钉住 IIFE 形态、二次求值和由实测尾簇加宽的 `--dsh-wco-pad`。`apps/web/tests/desktop-chrome.e2e.ts` 是无密钥的组装断言：标题栏有 Session log、Git 和两个开关，右侧栏空态有五张卡。

## 相关

[右边栏与终端的 T3 工作流](../feature/2026-08-16-surfaces-terminal-t3-workflows.zh.md) 拥有已移植的工作环和故意不移植的项。[Web GUI 浏览器 e2e 通道](../testing/2026-07-24-web-gui-browser-e2e-lane.md) 拥有快照机制。[slot 声明注入决策](2026-08-05-slot-declaration-injection.md) 拥有 `shell.titlebar.trailing` 上贡献方的生命周期。
