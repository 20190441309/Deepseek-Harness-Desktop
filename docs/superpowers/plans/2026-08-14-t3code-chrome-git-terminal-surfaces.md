# T3code 标题栏 / Git / 底栏终端 / 纯右边栏 Implementation Plan

> **集成状态（2026-08-15）**：9 个 Task 已由分支 `feat/t3code-chrome-git-terminal-surfaces` 实现并合入桌面工作树。生产集成额外修复了分支遗留问题：session-maybe slot 的 store 注入（`web-react/scoped-slots.tsx` 空 key 兜底）；移除占用方对 `surfaces.*` / `shell.titlebar.trailing` 的重复 SlotMap 声明（catalog 契约）；终端从 raw `<pre>` 升级为完整 xterm + FitAddon VT 渲染；Git / Files / PTY 主进程接口全部收敛到工作区授权根（`src/main/workspace-authority.js`）；PTY 与 BrowserView 增加 `killAll` / `closeAll` 并在退出、重启、重载时清理。已知缺口：标题栏快捷键（Ctrl+` / Ctrl+\）未引入全局 keybinding 基建，未作为本期交付；本机打包验证受 Visual Studio Build Tools 缺失限制（CI 的 windows-latest runner 可构建 node-pty）。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 Deepseek-Harness-Desktop 上按 T3code 的交互，加上标题栏 Git 与面板开关、底栏终端、以及五个 surface 的纯右边栏；现有工具详情一行不改。

**Architecture:** Harness client 插件拥有 UI 与状态；Electron 只提供 `git` / `pty` / `preview` IPC。`AppFrame` 增加第四列 `surfaces` 和底栏轨道；工具详情继续占现有 `details` 列。标题栏尾簇是新的 `shell.titlebar.trailing` 列表槽，从左到右：Session log → Git → 底栏开关 → 右栏开关，再空出窗口控件。

**Tech Stack:** 现有 Cordis slot / `defineStore` / CSS Modules；Electron `ipcMain` + `contextBridge`；本机 `git`；node-pty 或 `ctx.subprocess.spawnTerminal` 的桌面桥；xterm 或等价前端终端；`<webview>` 做 Browser。行为以 `C:\Ai\t3code` 为准，不拷它的 zustand / Ghostty / Effect 栈。

## Global Constraints

- 工具详情（`details` 列、Inspect、轨迹点 TOOL）不改行为、不改注册目标。
- 左栏（`ui-sidebar` / `ui-workspace`）不改信息架构。
- 轨迹继续是中间栏选项卡。
- 产品行为、弹窗、主按钮文案状态机跟 T3code：`apps/web/src/components/GitActionsControl.logic.ts`、`ThreadTerminalDrawer.tsx`、`RightPanelTabs.tsx`、`rightPanelStore.ts`、`chat/PanelLayoutControls.tsx`。
- **布局与控件结构跟 T3code，外观跟本应用。** 见下方 Visual language。禁止引入 Tailwind、lucide、T3 的 shadcn/Base UI 皮肤。
- 新 UI 走 `packages/client/*` 插件 + slot，禁止在 `harness-chrome-inject.js` 里画 Git / 终端 / 右栏。
- 每个新 `@deepseek-ai/dsh-client-*` 包按 [adding-a-package.md](../../../vendor/deepseek-harness/docs/cookbook/adding-a-package.md) 和 [packages/client/AGENTS.md](../../../vendor/deepseek-harness/packages/client/AGENTS.md) 建齐：`package.json` / `tsconfig` / `invariant` / README / `dsh.client` / `web-app` 依赖与 `cordis.patch.yml` 行 / `tsconfig.client.json` references。
- 组件只吃四份 props；跨包只走 slot 和 `ctx` 服务。
- 同一 PR 写一条 Agent Note（`.agents/notes/`），非琐碎可见行为补 keyless snapshot。
- 桌面 IPC 只暴露在 `window.shell`，不把 Node 打进渲染进程。
- 中文产品文案，代码注释英文。

## Locked product decisions

1. 四列：`sidebar | conversation | details | surfaces`。`details` 不动。
2. 标题栏开关只控制 `surfaces` 和底栏终端，不控制 `details`。
3. Session log 从会话顶栏 utilities 挪到标题栏尾簇最左（仍是同一个下载按钮）。
4. 五个 surface 都做：Browser、Terminal、Files、Diff、Agents。
5. 底栏终端和右栏 Terminal 共用同一批 PTY 会话（T3code：一个 id，两个壳）。
6. Git 主按钮按 `resolveQuickAction` 切换文案（Commit / Commit & push / Push / 建变更请求等），下拉有 Commit、Push、Create change request。
7. 视觉：T3code 的分栏、分裂按钮、空态五卡、抽屉工具条；漆成 Harness 的 token、圆角、字号、已有 primitive。

## Visual language

从 T3code **只借结构**，不借皮肤。

| 借 T3code | 用本应用 |
|---|---|
| 标题栏尾簇从左到右：Session log、Git 分裂按钮、底栏 Toggle、右栏 Toggle | `--dsw-alias-*` 色、字、边框；禁止字面色 |
| Git：主按钮 + 竖线 + chevron；下拉三项带图标 | CSS Modules + `clsx`，不要 Tailwind |
| 开关：小方图标，pressed = 面板开 | 高度 32px，对齐现有 Session log / 窗口控件 |
| 右栏空态：2×N 卡片（大图标 + 标题 + 一句说明） | 圆角 12–18px（Session log 已是 18；Pill / 代码块 12） |
| 底栏：顶部分割线 + 右上 分屏 / 最大化 / + / 关闭 | 字号 13/20 或 14/20；图标走 `ui-primitives` 线稿，缺的在同一套里补，不引入 lucide |
| 菜单、确认、提交说明弹窗的**步骤和文案状态** | `Tooltip` / `Menu` / `Dialog` / `Pill` 现有 primitive 与 motion recipe |

对照现成零件：

- Session log 胶囊：`session-log-export` `HeaderAction.module.css`（32px 高、18px 圆、13px、`border-l2`、hover `interactive-bg-hover`）。Git 主按钮用同一胶囊语汇，右侧切出 chevron 区。
- 图标按钮：侧栏 `iconButton` / 窗口控件 32×32、8–999 圆。Toggle 用 32×32、8px 圆、透明底、hover 同 `interactive-bg-hover`；pressed 用 `button-ghost-active-fill` + inset border（`Pill` 的 active）。
- 右栏列：与 `DetailsPanel` 同族——`border-l2` 左边线、`bg-base`、标题 14/20 medium、内边距 12–16。空态卡：浅底 `bg-layer-2`、12px 圆、不要 T3 那种大投影卡片。
- 深浅色、毛玻璃、背景图一律吃现有 `ui-theme`，组件里不写 `data-theme` 分支。

验收：并排本应用对话页，新控件应像「多了几个官方按钮」，不像嵌了一块 T3code。

## File map

| 单位 | 路径 | 职责 |
|---|---|---|
| 布局 | `vendor/deepseek-harness/packages/client/ui-layout/` | 第四列 `surfaces`、底栏轨道、`toggleSurfaces` / `toggleTerminalDrawer`、`shell.titlebar.trailing` |
| 标题栏簇 | `packages/client/ui-titlebar/`（新） | Git 座、底栏/右栏 Toggle，注入 `shell.titlebar.trailing` |
| Session log | `packages/session-query/session-log-export/src/client/index.ts` | 改注册到 `shell.titlebar.trailing`，`order: 10` |
| Git | `packages/client/ui-git/`（新）+ `src/main/git.js` | 状态机 + 提交/推送/PR 弹窗；主进程跑 git |
| 用户终端 | `packages/client/ui-user-terminal/`（新）+ `src/main/pty.js` | 会话表、底栏抽屉、右栏 Terminal surface |
| 右栏壳 | `packages/client/ui-surfaces/`（新） | 空态五卡、标签、关/分屏控件；声明五个子座 |
| Files | `packages/client/ui-files/`（新） | 工作区树 + 文件预览 surface |
| Diff | `packages/client/ui-diff/`（新） | 工作区 git diff |
| Browser | `packages/client/ui-preview/`（新）+ `src/main/preview.js` | 本地 URL / 应用预览 |
| Agents | `packages/client/ui-agents-panel/`（新） | 映射现有 subagent 目录，不重做派遣内核 |
| 窗口控件留白 | `src/main/harness-chrome-inject.js` | `--dsh-wco-pad` 按尾簇实测宽度加大，避免挡按钮 |
| 预加载 | `src/preload/index.js` | `shell.git*` / `shell.pty*` / `shell.preview*` |

T3code 对照（只读，不拷栈）：

- 标题栏开关：`C:\Ai\t3code\apps\web\src\components\chat\PanelLayoutControls.tsx`
- Git 状态机：`C:\Ai\t3code\apps\web\src\components\GitActionsControl.logic.ts`
- Git UI：`C:\Ai\t3code\apps\web\src\components\GitActionsControl.tsx`
- 底栏抽屉：`C:\Ai\t3code\apps\web\src\components\ThreadTerminalDrawer.tsx`
- 右栏 store / 空态：`C:\Ai\t3code\apps\web\src\rightPanelStore.ts`、`RightPanelTabs.tsx`
- 终端 UI 状态：`C:\Ai\t3code\apps\web\src\terminalUiStateStore.ts`

---

### Task 1: 布局第四列 + 底栏轨道 + 标题栏尾槽

**Files:**
- Modify: `vendor/deepseek-harness/packages/client/ui-layout/src/client/columns.ts`
- Modify: `vendor/deepseek-harness/packages/client/ui-layout/src/client/stores.ts`
- Modify: `vendor/deepseek-harness/packages/client/ui-layout/src/client/service.ts`
- Modify: `vendor/deepseek-harness/packages/client/ui-layout/src/client/index.ts`
- Modify: `vendor/deepseek-harness/packages/client/ui-layout/src/client/AppFrame.tsx`
- Modify: `vendor/deepseek-harness/packages/client/ui-layout/src/client/AppFrame.module.css`
- Modify: `vendor/deepseek-harness/packages/client/ui-layout/src/client/contract`（若有 SlotMap 注释）
- Test: `vendor/deepseek-harness/packages/client/ui-layout/tests/columns.client.spec.ts`
- Test: `vendor/deepseek-harness/packages/client/ui-layout/tests/layout-store.client.spec.ts`
- Test: `vendor/deepseek-harness/packages/client/ui-layout/tests/app-frame.client.spec.tsx`
- Test: `vendor/deepseek-harness/packages/client/ui-layout/tests/service.client.spec.ts`

**Interfaces:**
- Consumes: 现有 `computeColumns(viewport, sidebar, details)`、`createLayoutStore`、`ILayout`
- Produces:

```ts
export const SURFACES_MIN = 320
export const SURFACES_MAX = 560
export const SURFACES_DEFAULT = 400
export const TERMINAL_DRAWER_MIN = 180
export const TERMINAL_DRAWER_DEFAULT = 280

export interface Columns {
  sidebar: number
  center: number
  details: number
  surfaces: number
}

type LayoutState = {
  sidebar: number
  details: number
  surfaces: number
  terminalDrawer: number
  narrow: boolean
  narrowExpanded: boolean
}

interface ILayout {
  toggleSidebar(): void
  openDetails(): void
  closeDetails(): void
  toggleSurfaces(): void
  openSurfaces(): void
  closeSurfaces(): void
  toggleTerminalDrawer(): void
  setTerminalDrawer(px: number): void
}
```

`computeColumns` 让步顺序：先压 `surfaces` 到 `SURFACES_MIN`，再压 `details` 到 `DETAILS_MIN`，再派生关闭 `surfaces`，再派生关闭 `details`，侧栏不让步。`details === 0` 与 `surfaces === 0` 仍表示关闭（surfaces 关闭宽度 0，不像侧栏留轨）。

`AppFrame` 声明：

```ts
children: {
  sidebar: { kind: 'single', scope: 'root' },
  conversation: { kind: 'single', scope: 'session-maybe' },
  details: { kind: 'single', scope: 'session' },
  surfaces: { kind: 'single', scope: 'session-maybe' },
  'shell.overlay': { kind: 'list', scope: 'root' },
  'shell.titlebar.trailing': { kind: 'list', scope: 'root' },
  'shell.terminalDrawer': { kind: 'single', scope: 'session-maybe' },
}
```

网格：`sidebar | conversation | details | surfaces`，底栏 `shell.terminalDrawer` 只铺在 conversation 列下方（T3code：中间栏底，不吃掉左栏）。`shell.titlebar.trailing` 固定在窗口右上，`right: var(--dsh-wco-pad)`，`-webkit-app-region: no-drag`。

- [ ] **Step 1:** 在 `columns.client.spec.ts` 加四列让步用例：宽窗口四列都开；变窄先减 surfaces；再减 details；再关 surfaces；再关 details。跑测试，确认失败（旧 `Columns` 没有 `surfaces`）。
- [ ] **Step 2:** 实现 `computeColumns` 四列与 store / `ILayout` 新动作。`toggleSurfaces`：0 ⟷ `SURFACES_DEFAULT`。`toggleTerminalDrawer`：0 ⟷ `TERMINAL_DRAWER_DEFAULT`。
- [ ] **Step 3:** `AppFrame` 画出 `surfaces` 列、底栏轨道、`shell.titlebar.trailing`。无 occupant 时列宽可为 0。现有 details 测试全部保持原断言。
- [ ] **Step 4:** `pnpm --filter @deepseek-ai/dsh-client-ui-layout test`（或该包 vitest）全绿。
- [ ] **Step 5:** 提交 `feat(layout): add surfaces column, terminal drawer track, titlebar trailing slot`

---

### Task 2: 把 Session log 挪到标题栏尾簇最左

**Files:**
- Modify: `vendor/deepseek-harness/packages/session-query/session-log-export/src/client/index.ts`
- Test: `vendor/deepseek-harness/packages/session-query/session-log-export/tests/client-apply.client.spec.tsx`
- Test: `vendor/deepseek-harness/packages/session-query/session-log-export/tests/header-action.client.spec.tsx`（若仍断言 utilities，改断言槽名，不改下载行为）

**Interfaces:**
- Consumes: Task 1 的 `shell.titlebar.trailing`
- Produces: 同一 `SessionLogDownloadHeaderAction`，`id: 'session-log-download'`，`order: 10`

```ts
ctx.slots.inject('shell.titlebar.trailing', () => ctx.slots.register({
  name: 'shell.titlebar.trailing',
  id: 'session-log-download',
  order: 10,
  locale: NS,
  inject: (): SessionLogDownloadDialogInjected => ({ /* 与现在相同 */ }),
}, SessionLogDownloadHeaderAction))
```

下载 / 弹窗 / `export` 命令逻辑一字不改。只换座位。

- [ ] **Step 1:** 改 apply 测试：注册目标是 `shell.titlebar.trailing`，不再是 `conversation.session.header.utilities`。
- [ ] **Step 2:** 改 `index.ts` 的 `inject` 目标与 `order: 10`。
- [ ] **Step 3:** 跑 session-log-export 的 client 测试。
- [ ] **Step 4:** 提交 `refactor(session-log-export): sit Session log in titlebar trailing cluster`

---

### Task 3: 标题栏开关（底栏 + 右栏）

**Files:**
- Create: `vendor/deepseek-harness/packages/client/ui-titlebar/`（完整 client 插件骨架，对照 `ui-sidebar`）
- Create: `src/client/PanelToggles.tsx`、`PanelToggles.module.css`、`apply.ts`、`locales.ts`、`invariant.ts`
- Modify: `packages/bundle/web-app/cordis.patch.yml`、`packages/bundle/web-app/package.json`、`tsconfig.client.json`
- Test: `packages/client/ui-titlebar/tests/panel-toggles.client.spec.tsx`
- Test: `packages/client/ui-titlebar/tests/apply.client.spec.ts`
- Modify: `src/main/harness-chrome-inject.js`（`reservedRight` 随尾簇变宽）

**Interfaces:**
- Consumes: `ctx.layout.toggleSurfaces`、`toggleTerminalDrawer`；store 快照 `surfaces` / `terminalDrawer`
- Produces: `shell.titlebar.trailing` 条目 `id: 'panel-toggles'`，`order: 40`

交互照抄 `PanelLayoutControls.tsx`：两个 ghost Toggle，图标底栏 / 右栏，`pressed` 跟开合走，tooltip 带快捷键（Ctrl+` 终端，Ctrl+\ 右栏，与 T3code 默认一致，写进 `ui-commands` 若已有命令表）。无工作区时终端 Toggle `disabled`（T3code `terminalAvailable`）。

空白首页也要能看到这排按钮（所以必须在 `shell.titlebar.trailing`，不能只挂会话 header）。

- [ ] **Step 1:** 按 cookbook 建包；`apply` 测试断言注入 `shell.titlebar.trailing` 且 `order === 40`。
- [ ] **Step 2:** 组件测试：点底栏图标调用 `toggleTerminalDrawer`；点右栏图标调用 `toggleSurfaces`；`surfaces > 0` 时右栏 Toggle 为 pressed。
- [ ] **Step 3:** 实现组件 + 接入 web-app bundle。
- [ ] **Step 4:** `pnpm run test:gui` 里跑新包测试。
- [ ] **Step 5:** 提交 `feat(titlebar): add terminal and surfaces toggles`

---

### Task 4: Electron Git IPC + `ui-git`（逻辑移植 T3code）

**Files:**
- Create: `src/main/git.js`、`src/main/git.test.js`
- Modify: `src/main/ipc.js`、`src/preload/index.js`
- Create: `vendor/deepseek-harness/packages/client/ui-git/`
- Create: `src/client/git-logic.ts`（从 T3code `GitActionsControl.logic.ts` 移植 `resolveQuickAction` / `buildMenuItems` / `requiresDefaultBranchConfirmation`，去掉 Effect 类型，改用本仓库的 `VcsStatus` JSON）
- Create: `src/client/GitActionsControl.tsx`（分裂按钮 + 下拉 + 提交说明弹窗 + 默认分支确认）
- Test: `packages/client/ui-git/tests/git-logic.client.spec.ts`（把 T3code `GitActionsControl.logic.test.ts` 的关键用例搬过来）
- Test: `packages/client/ui-git/tests/git-actions.client.spec.tsx`

**Interfaces:**
- Consumes: 当前会话 `cwd`（`useSessions` → `list.byId[id].cwd`）
- Produces: `window.shell`：

```ts
gitStatus(cwd: string): Promise<VcsStatus>
gitCommit(cwd: string, message: string): Promise<GitResult>
gitPush(cwd: string): Promise<GitResult>
gitPull(cwd: string): Promise<GitResult>
gitCreateChangeRequest(cwd: string, input: { title: string; body: string }): Promise<GitResult>
```

`VcsStatus` 字段对齐 T3code `VcsStatusResult` 的最小集：`refName`、`hasWorkingTreeChanges`、`hasUpstream`、`aheadCount`、`behindCount`、`aheadOfDefaultCount`、`pr`、`sourceControlProvider`。主进程用 `git` CLI（`status -sb`、`rev-list`、`gh`/`git` 探 PR）；没有 git 或不是仓库时返回 `null` 状态，主按钮 disabled + hint「Git status is unavailable.」。

主按钮文案必须跟 `resolveQuickAction` 一致。下拉三项：Commit、Push、Create change request（无 PR 提供方时第三项用 T3code 的 terminology，GitHub 为 Pull request）。默认分支上的 push / commit_push 先弹确认，文案用 `resolveDefaultBranchActionDialogCopy`。

`shell.titlebar.trailing` 条目 `id: 'git-actions'`，`order: 20`（Session log 10 与 toggles 40 之间）。

- [ ] **Step 1:** 用 T3code 测试向量写 `git-logic.client.spec.ts`（有改动 → Commit & push；无改动有 ahead → Push；默认分支确认）。先红。
- [ ] **Step 2:** 移植 `git-logic.ts`，测试绿。
- [ ] **Step 3:** `git.js` 单测：对临时仓库 `init` + 改文件，`gitStatus` 报 `hasWorkingTreeChanges: true`。
- [ ] **Step 4:** 做分裂按钮 UI + IPC 接线；无 cwd 时按钮 disabled。
- [ ] **Step 5:** 提交 `feat(git): T3code-style commit/push control`

---

### Task 5: 用户终端（底栏 + 右栏共用会话）

**Files:**
- Create: `src/main/pty.js`（或桥接 harness `ctx.terminals`：桌面端优先 Electron 侧 node-pty / conpty，cwd = 工作区）
- Modify: `src/preload/index.js`、`src/main/ipc.js`
- Create: `vendor/deepseek-harness/packages/client/ui-user-terminal/`
- Create: store `createTerminalSessionStore()`：`sessions[]`、`activeId`、每会话 `cols/rows`
- Create: `TerminalDrawer.tsx`（占 `shell.terminalDrawer`）
- Create: `TerminalSurface.tsx`（占 `surfaces.terminal`，由 Task 6 声明）
- Test: drawer 开合、新建 / 关闭 / 分屏（最多 T3code 的 `MAX_TERMINALS_PER_GROUP`）、底栏与右栏切到同一 `terminalId` 看到同一会话

**Interfaces:**

```ts
ptyCreate(input: { cwd: string }): Promise<{ id: string }>
ptyWrite(id: string, data: string): Promise<void>
ptyResize(id: string, cols: number, rows: number): Promise<void>
ptyKill(id: string): Promise<void>
onPtyData(handler: (payload: { id: string; data: string }) => void): () => void
onPtyExit(handler: (payload: { id: string; code: number }) => void): () => void
```

抽屉控件照 T3code：分屏、最大化、+、垃圾桶。高度拖到 `TERMINAL_DRAWER_MIN`..= 75% 视口，写入 `setTerminalDrawer`。快捷键 Ctrl+` 调 `toggleTerminalDrawer`。

没有项目 cwd 时不创建 PTY，Toggle disabled。

- [ ] **Step 1:** IPC 往返测试（假 pty）：create → write 回显 → kill。
- [ ] **Step 2:** store 测试：两个壳 `activate(id)` 共享同一 session 记录。
- [ ] **Step 3:** 抽屉 UI + xterm（或现有 TerminalBlock 升级为可交互）；右栏 surface 等 Task 6 壳就位后挂上。
- [ ] **Step 4:** 提交 `feat(terminal): shared PTY sessions for drawer and surfaces`

---

### Task 6: 纯右边栏壳 + 空态五卡

**Files:**
- Create: `vendor/deepseek-harness/packages/client/ui-surfaces/`
- Create: `createSurfacesStore()` — 对齐 `rightPanelStore.ts` 的 thread 作用域：这里用 `sessionId` 当 key
- Create: `SurfacesRoot.tsx`、`EmptyState.tsx`、`SurfaceTabs.tsx`
- Occupy: `surfaces` 单座（layout 声明）
- Declare children: `surfaces.browser` / `surfaces.terminal` / `surfaces.files` / `surfaces.diff` / `surfaces.agents`（均为 `kind: 'single'` 或 terminal 用 list）

**Interfaces:**

```ts
type SurfaceKind = 'preview' | 'terminal' | 'files' | 'diff' | 'agents' | 'file'

type Surface =
  | { id: string; kind: 'preview'; resourceId: string | null }
  | { id: string; kind: 'terminal'; terminalIds: string[]; activeTerminalId: string }
  | { id: 'files'; kind: 'files' }
  | { id: 'diff'; kind: 'diff' }
  | { id: 'agents'; kind: 'agents' }
  | { id: string; kind: 'file'; relativePath: string }

type SurfacesState = {
  bySession: Record<string, { activeId: string | null; surfaces: Surface[] }>
}

// actions: open(kind), activate, close, closeOthers, closeToRight, closeAll
```

空态文案按 T3code `RightPanelEmptyState`：Browser「Open a local app or URL.」；Terminal「Start a shell in this workspace.」；Files「Browse and read workspace files.」；Diff「Review git changes.」；Agents「Inspect running agents.」（中文 locale 对照翻译）。点卡片：`open(kind)` 且 `layout.openSurfaces()`。

无 surface 且列已开 → 空态。有 surface → 标签条 + 当前 occupant。

- [ ] **Step 1:** store 单测：open files → surfaces 含 `files`；close → 回到空态。
- [ ] **Step 2:** 空态五卡点击测试。
- [ ] **Step 3:** 接到 `surfaces` 列；标题栏 Toggle 只改 layout 宽度，不清 store。
- [ ] **Step 4:** 提交 `feat(surfaces): T3code-style right panel shell`

---

### Task 7: Files + Diff surfaces

**Files:**
- Create: `packages/client/ui-files/` — 注入 `surfaces.files`（及 `file` 单文件）
- Create: `packages/client/ui-diff/` — 注入 `surfaces.diff`
- 复用 Electron `git.js` 的 `gitStatus` / 新增 `gitDiff(cwd)`；文件树用现有 fs 工具或 `shell` 读目录（只读，工作区根 = session cwd）

Files：树 + 点文件在右栏开 `file:` surface（T3code `openFile`）。Diff：工作区变更列表 + hunk，交互看 `C:\Ai\t3code\apps\web\src\components\DiffPanelShell.tsx`。不是仓库时 Diff 卡 disabled，理由与 T3code `SURFACE_DISABLED_REASONS.diff` 相同。

- [ ] **Step 1:** Files 树渲染测试（假目录）。
- [ ] **Step 2:** Diff 在有/无 git 仓库下的可用态。
- [ ] **Step 3:** 提交 `feat(surfaces): files and diff`

---

### Task 8: Browser + Agents surfaces

**Files:**
- Create: `packages/client/ui-preview/` + `src/main/preview.js`（`<webview>` 或 `BrowserView` 贴在 surface 矩形上；仅桌面）
- Create: `packages/client/ui-agents-panel/` — 列出当前会话 subagent（读现有 `ctx` / 会话快照，不新造派遣）
- web 非 Electron 时 Browser 卡 disabled：「Browser previews are only available in the desktop app.」（T3code 原文）

- [ ] **Step 1:** preview IPC：打开 `http://127.0.0.1:*` 成功，拒绝非本地任意跳转（跟 web 包「凭据请求不跟重定向」同一精神：预览不带用户 API key）。
- [ ] **Step 2:** Agents 面板：有子代理时列出，无则空态。
- [ ] **Step 3:** 提交 `feat(surfaces): browser preview and agents`

---

### Task 9: 窗口控件避让 + 文档 + snapshot

**Files:**
- Modify: `src/main/harness-chrome-inject.js` — `reservedRight()` 改为：窗口控件宽度 + 实测 `#dsh-shell-titlebar-trailing` 宽度（或 CSS 变量由 React 写入 `--dsh-titlebar-trailing`）
- Create: `vendor/deepseek-harness/.agents/notes/implemented/architecture/2026-08-14-desktop-surfaces-and-titlebar.md`（及中文对、sidecar）
- Snapshot：`examples/` 或现有 web snapshot 加一条「标题栏有 Session log + Git + 两个 Toggle」「右栏空态五卡」
- Modify: 根 `README.md` / `README.en.md` 功能列表加 Git / 终端 / 右边栏

- [ ] **Step 1:** 拖窗口时标题栏按钮不与最小化重叠（手动 + 注入 pad 单测若可测）。
- [ ] **Step 2:** `doc-sync` 需要的预算 / 链接。
- [ ] **Step 3:** `DSH_SNAPSHOT=replay pnpm run test:web`（若改了组装输出）。
- [ ] **Step 4:** 提交 `docs: surfaces titlebar note and snapshots`

---

## 阶段交付（每一段都能单独用）

| 阶段 | Tasks | 用户能看到 |
|---|---|---|
| A 壳 | 1–3 | Session log 在最小化更左边；底栏/右栏开关能开空列和空底栏 |
| B Git | 4 | Commit & push 分裂按钮，弹窗与下拉按 T3code |
| C 终端 | 5 | 底栏 PTY；右栏 Terminal 卡打开同一会话 |
| D 右栏内容 | 6–8 | 五卡齐，Files / Diff / Browser / Agents 能用 |
| E 收尾 | 9 | 避让、文档、snapshot |

## 刻意不做

- 不改工具详情、Inspect、轨迹表。
- 不重做左栏。
- 不把 T3code 的 Ghostty / Effect / zustand 右栏 store 整段拷进仓库。
- 不在 `harness-chrome-inject.js` 里实现 Git 或终端。

## 验证（整条做完）

1. 打开有 git 的工作区：标题栏从左到右为 Session log、Git、底栏开关、右栏开关、窗口控件。
2. 点 Inspect：工具详情仍在中间偏右的 `details` 列，逻辑与现在一致。
3. 点右栏开关：再右边出现五卡；点 Files / Diff / Terminal / Browser / Agents 能开对应 surface。
4. 底栏开关打开终端；在右栏再开 Terminal，是同一个 cwd 会话族。
5. Git：有改动时主按钮为 Commit & push；下拉可只 Commit；默认分支会确认。
6. 关掉右栏不影响工具详情；关掉工具详情不影响右栏。
