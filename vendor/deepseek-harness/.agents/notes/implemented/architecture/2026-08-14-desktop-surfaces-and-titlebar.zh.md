# Agent Note: 桌面 surfaces 栏、标题栏尾簇与窗口控件避让

Status: implemented

[English](2026-08-14-desktop-surfaces-and-titlebar.md) | 中文

> 范围：已交付的四栏 AppFrame、`shell.titlebar.trailing` 列表 slot、桌面 `git` / `pty` / `preview` IPC，以及按实测宽度避让窗口控件。组合规则见 [slot 体系标准](2026-07-22-slot-type-chain-implementation.md)；加载链与对象层见 [Web 客户端架构 note](2026-07-19-gui-web-client-architecture.md)。本 note 不取代那些决策。

## 问题

桌面壳需要 T3code 风格的 Git、底栏终端和最右侧 surfaces 栏，同时不能移动 Inspect，也不能重做左侧栏。无边框窗口还要保证不断变宽的标题栏尾簇不与自绘的最小化 / 最大化 / 关闭按钮重叠。

## 决策

AppFrame 是四栏：`sidebar | conversation | details | surfaces`，外加只位于会话栏下方的终端抽屉。关闭的 `details` 与 `surfaces` 宽度为 0。让步顺序是先把 surfaces 压到下限，再压 details，再派生关闭 surfaces，再派生关闭 details；侧栏不让步。`ctx.layout` 对 surfaces 和抽屉的写入与 details 相互独立：标题栏开关从不打开或关闭详情栏，关闭其中一栏也不会关闭另一栏。

标题栏尾簇是布局拥有的列表 slot `shell.titlebar.trailing`，包装为 `#dsh-shell-titlebar-trailing`。贡献方通过 [slot 声明注入](2026-08-05-slot-declaration-injection.md) 注册。从左到右：Session log（`id: 'session-log-download'`，`order: 10`）、Git（`id: 'git-actions'`，`order: 20`）、面板开关（`id: 'panel-toggles'`，`order: 40`），然后是 Electron 窗口控件。开关只写入 `toggleTerminalDrawer` 和 `toggleSurfaces`。Session log 仍是原来的下载控件；仅在当前有会话时渲染。

Harness 客户端插件拥有 UI。Electron 只暴露 `window.shell.git*`、`window.shell.pty*` 和 `window.shell.preview*`；注入脚本不绘制 Git、终端或右侧栏。底栏抽屉与 Terminal surface 共用同一组面向工作区 cwd 的 PTY 会话。五个 surface 是 Browser、Terminal、Files、Diff 和 Agents。在桌面应用之外，Git IPC 为空操作，Browser 卡禁用。

`reservedRight()` 等于窗口控件宽度加上实测的 `#dsh-shell-titlebar-trailing` 宽度再加一段簇间距；该宽度为 0 时只保留控件宽度。注入脚本发布 `--dsh-wco-pad`（完整避让）和 `--dsh-wco-controls`（仅窗口控件）。尾簇使用 `right: var(--dsh-wco-controls, var(--dsh-wco-pad))` 定位，避免已增大的 pad 把尾簇推向左侧并再次加宽自己。注入脚本是可重复执行的 IIFE：对同一文件的第二次 `executeJavaScript` 不得抛错。可供 Node require 的辅助函数放在 `src/main/harness-chrome-metrics.js`。

## 备选方案

**在 `harness-chrome-inject.js` 里绘制 Git、终端或右侧栏。** 该文件会执行两次（`dom-ready` 然后 `did-finish-load`）；顶层绑定会抛错，catch 会把窗口涂成白色。桌面 chrome 也没有 slot、locale 或 store（存储）座位。

**用 surfaces 替换 details 栏，或让标题栏开关驱动 details。** Inspect、轨迹表的 TOOL 检查器和现有的详情开闭仍属于 `details`。共用一个开关会把两列耦合在一起。

**整段拷贝 T3code 的 Ghostty / Effect / zustand 右侧栏栈。** 客户端已经通过 slot 和 `defineStore` 组合。第二套状态栈会重复所有权，并破坏四份 props 规则。

**用 `--dsh-wco-pad` 定位尾簇。** pad 包含尾簇自身宽度，每次测量都会把尾簇推向左侧。`--dsh-wco-controls` 才是仅窗口控件的 inset。

**用写死的尾簇宽度代替实测 `#dsh-shell-titlebar-trailing`。** Session log、Git 和开关会随 locale、状态和占用变化宽度。常量要么挡住窗口控件，要么留下永久空洞。

## 影响

Web 组合与桌面窗口共用同一批客户端插件；Electron 是 IPC 宿主，不是第二棵 UI 树。details 与 surfaces 可以各自开闭。窗口控件避让跟随实时尾簇，因此新增标题栏占用者不必再改一处 inset 常量。

注入脚本保持为封闭的 chrome IIFE。需要新标题栏控件的贡献方以带 `order` 的方式注册到 `shell.titlebar.trailing`，不要把 Node 辅助函数写进该文件。

## 测试

各包套件钉住让步、store 动作、标题栏注入 / dispose（资源释放）、Git 状态、共享 PTY 所有权，以及五卡空态。`src/main/harness-chrome-inject.test.js` 钉住 IIFE 形态、二次求值和由实测尾簇加宽的 `--dsh-wco-pad`。`apps/web/tests/desktop-chrome.e2e.ts` 是无密钥的组装断言：标题栏有 Session log、Git 和两个开关，右侧栏空态有五张卡。

## 相关

[Web GUI 浏览器 e2e 通道](../testing/2026-07-24-web-gui-browser-e2e-lane.md) 拥有快照机制。[slot 声明注入决策](2026-08-05-slot-declaration-injection.md) 拥有 `shell.titlebar.trailing` 上贡献方的生命周期。
