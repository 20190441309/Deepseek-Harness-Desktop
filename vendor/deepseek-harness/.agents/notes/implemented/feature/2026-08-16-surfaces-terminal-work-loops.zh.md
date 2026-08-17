# Agent Note: 右边栏与终端工作环

Status: implemented

[English](2026-08-16-surfaces-terminal-work-loops.md) | 中文

## 问题

桌面 surfaces 列和会话底栏终端先交付了五卡壳和 PTY 分屏，五个 occupant 停在薄查看器。Files 不能搜索或保存。Browser 只剩地址栏。Diff 空态卡对任意 cwd 亮起，还复用了服务端会话文案。终端选区进不了输入框。空态卡片不等于列已完成。

## 决策

继续用 dsh 的 slot/store 和 `--dsw-alias-*` 铬。实现本桌面能诚实拥有的工作环：

- Files：按名搜索（深度 8 / 目录 200；触达上限时面板提示搜索已提前停止），utf8 编辑并通过 `shell:write-file` 保存（workspace-authority，512 KiB 上限）。刷新会重载根目录；搜索进行中时会重新走搜索，不会丢掉嵌套匹配。提及是行内 `@` 写入输入框，没有 session id 时不展示；右键复制相对或绝对路径。写入失败时编辑器和未保存缓冲区仍在。关闭未保存的 `surfaces.file` Tab 会确认（继续编辑 / 放弃 / 保存）；`FilePreview` 经 `onDirtyChange` 报告 dirty（cwd 短暂缺失时也保持），挂载时从 `readBuffer` 同步灌入，并且第一次读取完成前不展示编辑器。occupant 的 React key 和 dirty 回调按会话隔离，两个会话打开同一路径时草稿互不覆盖。内存缓冲区在会话切换后仍保留，直到关闭 Tab；磁盘在脏草稿下变化或重读失败时仍保留草稿。保存（工具栏、Ctrl/Cmd+S、关闭确认）在 Tab 活动、cwd 存在且草稿未保存时写入，即使最近一次重读失败或返回截断／二进制也会写。这些情况下以及 cwd 缺失时，脏草稿仍留在编辑器（含 Markdown 源码）；cwd 回来之前 Save 保持禁用。写入成功后清除截断／二进制标记，编辑器保持可改。未保存草稿写入 surfaces 的 localStorage 桶，刷新或退出后仍能恢复（`pagehide`／`beforeunload` 立即落盘，并取消未到期的防抖，避免放弃关闭被旧写入覆盖）。文件 Tab 激活时会在草稿下重读磁盘。保存会先重读；若磁盘相对记住的基线和草稿都已变化，则拒绝一次（`error.changed`）。
- Browser：后退 / 前进 / 刷新 / DevTools / 系统浏览器（地址栏，访客页尚未打开时也可用） / 发现的 loopback 端口（occupant 挂载期间持续扫描）；铬是图标后退／前进／刷新、回车提交的 `Input`、系统浏览器图标，以及开发者工具所在的「更多」菜单。guest 的 `did-navigate`／`did-navigate-in-page` 发出 `shell:preview-state-change`，地址栏和前进／后退跟随页内导航。文档导航留在 loopback；允许 CDN 子资源。已打开的 occupant 在切 surface Tab 时保持挂载（`active` 通过 `previewHide` 藏起 guest；`occluded` 在 surface 菜单或未保存文件对话框盖住原生命中区时同样藏起；「更多」菜单打开时也藏起；关闭 Tab 才 `previewClose`）。终端通过 `dshd-open-surface` 和 `dshd-pending-preview-url` 在 occupant 稍后挂载时打开 guest（含空白会话 key）。这两个字符串在各客户端包内重复；slot 规则禁止跨包值导出。
- Diff：`gitStatus` 空态卡门禁；工作区 vs 分支（`gitDiff(cwd, { baseRef })` 三点范围，非零退出返回 null）；有效仓库但 diff 失败显示加载错误，而不是非仓库空态。工作区 hunk 是 `git diff HEAD`（同一文件的暂存与未暂存合并）。porcelain 暂存／取消暂存／还原失败时文件列表仍在（`opError` 横幅）；未跟踪（`??`）还原走 `git clean -f`（目录 `-fd`）。全部折叠 / 全部展开。分支 Menu 可搜索全部列出的引用。分支范围隐藏暂存 / 取消暂存 / 还原。不分栏、忽略空白、折行开关。
- 终端：选区复制 / 加入对话（`terminal` 围栏，经 `ctx.get('conversation')`；没有 session id 时该动作禁用）；⌘／Ctrl-点击和选区打开 http(s) 与工作区路径；loopback http(s) 打开 Browser，其它 http(s) 调用 `window.shell.openExternal`；最大化还原上次**会话底栏抽屉**高度（`surfaces.terminal` occupant 没有单独最大化）。
- 布局：`dshd.layout.panels` 记住上次打开的 surfaces 宽度和终端抽屉高度，以及当时是否打开。

GPU 终端嵌入、worktree 多环境、checkpoint turn-diff、批注拾取、首选编辑器 Open-in、拖文件进输入框、PiP/录制不在范围内：本 harness 没有对等会话元数据，装一半等于撒谎。终端链接会把 xterm 折行拼回一条，并丢掉 `:line:column`，因为 FilePreview 没有跳行。Agents 行只用会话列表快照（running/inactive、mode、jobs）；任务生命周期状态走文案表；任务只读；该快照没有 token 计数或 workflow 脚本树。

## 考虑过的替代

**五张卡齐了就宣称这一列完成。** 否决：价值是工作环（搜索、保存、导航、选区进对话），不是卡片网格。

**粘贴 Tailwind GPU 终端 occupant。** 否决：设计语言第 15 条和 slot / 四份 props 合同。

**用会话事件假装 turn-diff。** 否决：没有耐久的 checkpoint 范围；假的 Latest turn 是第二次降级。

**把 Diff 铬（分栏／折行／忽略空白）当成工作环的必要条件。** 否决：那些是渲染开关；工作环是搜索、保存、导航、选区进对话。分栏仍是 Diff README 的已知限制。

## 后果

`workspace-fs.writeFile`、`preview.back/forward/reload/state/openDevTools/discover` 以及 `shell:preview-state-change`、还有 `gitDiff(..., { baseRef })` 是桌面 IPC。特权 BrowserView／BrowserWindow 导航使用按 hostname 解析的 loopback 检查（`local-url.js`），boot 的 `file:` 钉在打包的 `boot.html`，marketplace 的 `file:` 钉在打包的 `marketplace/index.html`，`showHarness` 拒绝非 loopback 基址并改写 `0.0.0.0`，拒绝的导航只对 http(s) 调用 `openExternal`，且同时守卫 `will-navigate` 与 `will-redirect`。客户端包仍走现有 `window.shell` inject。终端选区写入围栏草稿，不是输入框芯片。终端打开文件走 `workspaces.openPath`（桌面拦截进 Files），并丢掉 `:line:column`，因为文件 surface 没有跳行。本笔记覆盖工作环（搜索、保存、guest URL、暂存／还原、loopback vs 系统浏览器）；Diff 分栏／折行／忽略空白不在范围内。

## 测试

`src/main/local-url.test.js` 钉 loopback 伪造拒绝、marketplace 文件钉、以及 navigate／redirect 允许策略。`src/main/window-nav.test.js` 钉特权守卫接线（拒绝 + 仅 http(s) openExternal）。`src/main/workspace-fs.test.js` 钉写入与穿越。`src/main/preview.test.js` 钉历史、发现、frame vs 子资源过滤，以及 guest `did-navigate` 的 `onState`。`src/main/git.test.js` 钉 `baseRef`、缺失分支返回 null、以及未跟踪 `gitDiscard` 走 `git clean`。`ui-surfaces` 钉 Diff 以 `gitStatus` 门禁、`dshd-open-surface`、keep-alive 切 Tab（Files 草稿 + Browser `active`→hide／关 Tab→close）、未保存文件 Tab 关闭确认（继续编辑 / 放弃 / 保存，含保存失败仍保留 Tab）、跨会话恢复文件缓冲区、两个会话打开同一路径时草稿隔离、以及 `pagehide` 后重挂载仍恢复脏草稿（放弃关闭会取消未到期的防抖写入）。`ui-preview` 通过地址栏回车、发现芯片和待打开 URL 事件打开 guest，并钉工具栏导航、guest 地址栏更新，以及非活动／遮挡／「更多」菜单 hide vs 卸载 close。`ui-user-terminal` 钉选区复制 / 加入对话 / 打开、loopback URL → Browser 与其它 http(s) → `openExternal`、抽屉最大化还原、以及 `surfaces.terminal` 无最大化。`ui-files` 钉搜索预算（含提前停止状态）、刷新时重新走活动搜索而不是丢掉嵌套匹配、没有 session id 时不展示提及、保存（含写入失败仍保留编辑器，磁盘已变时保留草稿并显示 `error.changed`，重读失败后 registerSave 仍能写入，以及截断或二进制重读后脏草稿仍可编辑保存）、Markdown 源码（含重读失败、截断重读、以及 cwd 缺失）、父节点 hidden keep-alive 下的未保存草稿、cwd 缺失时仍报告 dirty、磁盘变化或重读失败时保留脏草稿、仅活动 Tab 响应 Ctrl+S、激活时重读并保留草稿、以及第一次读取完成前不展示编辑器。`ui-layout` 钉 surfaces／抽屉持久化。`ui-diff` 钉分支范围的三点调用、加载错误 vs 非仓库、Stage 失败仍保留文件列表、以及分支菜单搜索超过五十条引用。`ui-agents-panel` 钉任务状态走文案表。

## 相关

[Desktop surfaces and titlebar](../architecture/2026-08-14-desktop-surfaces-and-titlebar.md) 拥有四栏框架。
