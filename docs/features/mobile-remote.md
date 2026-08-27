# Feature: 手机远程

| Field | Value |
| --- | --- |
| **id** | `mobile-remote` |
| **status** | `active` |
| **last verified** | 2026-08-27 — Phase 1 落地：会话目录游标分页 + 子智能体折叠、时间线向上分页（seq 去重 + 滚动锚点）、归档/历史/删除/重命名（确认 + 可见错误，取消归档 = `refreshAgent` 诚实标注）、审批按 daemon `actions` 原样渲染 + 跨端 `permission_resolved`、模型 chip/pane（`listProviderModels` + `setAgentModel` 失败回滚，新会话透传 model）、`/` 斜杠命令（`listCommands`）、草稿文本 + 附件跨会话切换、注入安全结构化 Markdown 与工具 detail/未知类型 fallback、`.phone` 固定 app-shell 高度修复时间线滚动。121 单测 + 19 项 fake-daemon 浏览器集成检查全绿；真机 relay 链路 BLOCKED，见 `docs/qa/results/2026-08-27/mobile-web-phase1.md`。 |

## User paths

1. 桌面开启配对且中继已连接 → 侧栏扫码（`http://<LAN>:3180/#offer=` v2）→ 手机系统相机打开 SPA → `DaemonClient` 经中继 E2EE 握手 → `deviceSecret` 落盘（sticky）→ 已配对态。
2. 再次打开手机 SPA（无 hash）：用已存 `deviceSecret` sticky 重连，无需再扫，直至桌面 **解除配对**。
3. Android：原生扫码或粘贴完整配对 URL → 提取 offer 后由应用内 WebView 打开 APK 内置的同一 SPA → 后续启动直接从安全 asset origin 触发 SPA sticky 重连，不必重新访问 LAN `:3180` 页面。
4. 设置 → 远程 → 网关：局域网 | 外出（文案区分）；传输始终走中继主机。
5. 手机「新会话」→ chooser sheet：`fetchWorkspaces` 列工作区（名称 · 项目 · 分支 · cwd）→ `getProvidersSnapshot(cwd)` 列 ready 提供方 → 可选权限模式（snapshot `modes`/`defaultModeId`）→ 把选中的 `workspaceId/cwd/provider(/modeId)` 显式传给 `DaemonClient.createAgent` → 打开新会话。
6. 手机工作区 → daemon checkout/file RPC 提供 Git 状态、提交、拉取、推送、创建 PR、切换已有分支和根目录文件；普通分支创建与电脑窗口操作禁用并提示在电脑端完成。
7. 会话权限模式：composer chip 与设置「权限」pane 显示 agent snapshot 的当前 mode；切换调用 `setAgentMode`，daemon 拒绝时回滚并显示错误原文；`mode_changed` 流事件写回 UI。
8. 断线：chat 顶部连接条显示「连接已断开 / 正在重新连接」，发送被拒绝且草稿保留（按 serverId+sessionId 存 localStorage；附件仅内存跨会话切换，不跨刷新）；client 自动重连成功后自动重拉 agent 目录与当前会话 timeline 并提示「已重新连接并同步」。
9. 会话抽屉：`fetchAgents` 游标分页（「加载更多会话」）；子智能体（snapshot `relation.parentAgentId/kind`）折叠在父会话下、父未加载时顶层标注「子智能体」，打开为只读（composer 换成只读说明）。行尾 ⋯ 菜单：重命名 / 重新生成标题（`updateAgent`）、归档（`archiveAgent`）、删除（`deleteAgent`），均确认对话框 + daemon 错误可见；「已归档会话」sheet 走 `fetchAgentHistory(includeArchived, updated_at desc)` 分页，「取消归档」调用 `refreshAgent` 并明示不会恢复运行中任务。
10. 时间线：tail 200 起步，顶部「加载更早消息」向上分页（`direction:'before'` 游标，seq 去重，滚动锚点保持，`reset/staleCursor` 时整页重置）；助手消息经 `conversation/markdown.js` 结构化解析 + createElement 渲染（原始 HTML 保持字面文本，链接仅 http/https）；工具卡显示状态 + detail 摘要/可展开正文；reasoning/todo/压缩/turn_changes/generative_ui/未知类型都有可见 fallback 行。
11. 审批：daemon `permission_requested` 的 `actions` 列表按 label/variant/顺序原样渲染，回传 `selectedActionId`；无 actions 才显示通用「允许一次/拒绝」；`permission_resolved`（含跨端解决）清除 pending 并恢复 composer。
12. 模型：composer 模型 chip 显示 snapshot `model`（空 = 提供方默认）；设置「模型」pane 用 `listProviderModels` 列清单、`setAgentModel` 切换，失败回滚 + banner；新会话 chooser 模式步之后可选模型并透传 `createAgent`。输入框以 `/` 开头触发 `listCommands` 斜杠命令弹层（前缀优先过滤，点击插入 `/name `）。

## Invariants

- 手机 = **同协议客户端**（`mobile/web/chisacode/` + `@chisacode/client` bundle），不是旧 HTTP Host SPA。
- SPA 不得从 `host/offer.js` / `host/login.js` 进入 v1 Cookie 登录；扫描结果保留完整 `#offer=` URL 后交给 `parseConnectionOfferFromUrl`。
- QR **落地页** = 本机 `mobile/web` on `:3180`（`preferredLanIp`），**永不**把中继 origin 当 SPA。
- Offer 内 `relay.endpoint` = 传输中继；WS 必须 `role=client`；`useTls` 读写一致（`=== true`）。
- Offer v1 / `POST /__remote__/login` / RemoteGateway 配对 **退役**。
- 桌面 `relayConnected` 反映真实 control socket；未连接时 UI 明示，扫码无法完成绑定。
- Android Compose 扫码框为正方形；会话走 APK 构建时纳入的同一 Web SPA（`WebViewAssetLoader` HTTPS origin），不另写一套 DaemonClient，也不依赖冷启动时仍能访问 LAN 落地页。
- Android 升级后一次性清除旧 HTTP `deviceToken`/`origin`；不保留 `LoginClient`、Bearer `/api/*`、`/__remote__/shell/*` 原生 Chat 死路径。
- Android 原生层只保存内置 SPA 已启用标记，不保存 offer；`deviceSecret` 由 SPA 保存在稳定 WebView asset origin 的 localStorage，直到桌面撤销或 SPA 断开设备。
- ChisaCode 会话创建、Git 与文件不得回退到 `callUnary` / `callShell`；daemon 返回的结构化错误必须进入可见 banner/toast。
- 权限模式唯一来源是 agent snapshot；UI 不得持有本地假 mode 状态，`setAgentMode` 失败必须回滚并显示 daemon 错误。
- 新会话必须经 workspace/provider chooser 显式选择；不得复用“第一条 agent”的 `provider/cwd` 猜测目标。
- 重连（`subscribeConnectionStatus` 回到 connected）后必须权威重同步（`fetchAgents` + 当前 timeline）；断线时发送必须被可见拒绝，不得假装在线；未发送草稿不得丢失。
- 普通分支创建和打开电脑设置/图库没有 daemon RPC：控件必须禁用并写明电脑端操作，不得抛旧 Host RPC 错误或伪报成功。
- 删除/归档不得乐观移除：只有 daemon 确认后行才离开列表，失败必须在确认对话框里可见。
- 「取消归档」= `refreshAgent`（清 archivedAt + 重载会话），**不是** dsh unarchive 也不是 `resumeAgent(handle)`；UI 不得写成「恢复」或暗示恢复运行状态。
- 审批 UI 不得改写 daemon `actions`（label/variant/顺序原样，回传 `selectedActionId`）；通用允许/拒绝仅在 actions 为空时出现。
- 助手 Markdown 渲染禁止 `innerHTML` 注入路径：结构化 block/span → createElement/textContent，链接 href 仅 http/https；未知时间线类型必须有可见 fallback，不得静默丢行。
- 时间线向上分页必须按 seq 去重并保持滚动锚点；`.phone` 保持固定 app-shell 高度（内部面板各自滚动），否则时间线锚定失效。
- 设计语言仍抄 `--dsw-alias-*`。

## Allowed touch

- `mobile/web/`（含 `chisacode/`、`conversation/`）、`scripts/bundle-chisacode-mobile-client.mjs`
- `src/main/chisacode-remote.js`、`src/main/mobile-web-server.js`、`src/shared/lan.js`
- `vendor/chisacode-remote/`、`ui-settings-remote`、本卡、QA 远程条
- `tools/mobile-web-qa/`（fake-daemon 浏览器集成 harness，不打包）
- `mobile/android/`（扫码 handoff）

## Do not touch

- 恢复 HTTP Bearer Host SPA 为主路径
- 指着 `app.chisacode.sh` / `relay.chisacode.sh` 冒充完成
- 把中继 IP 当作 QR `appBaseUrl`

## Gates

| Kind | What |
| --- | --- |
| Automated | `mobile/web/**/*.test.js`（含 `chisacode/{session,parity,controller,directory,timeline,approvals,commands}.test.js`、`conversation/{fold,markdown}.test.js`、`pair/scan.test.js`）；Android JVM tests；`src/shared/lan.test.js`；`chisacode-remote.test.js` |
| Browser | `node tools/mobile-web-qa/run-qa.mjs`（fake DaemonClient + 真实 SPA 栈；需 `npm i --no-save puppeteer-core` 与 Chrome） |
| Manual | 中继已连接 → 扫码配对 → chooser 新建会话（多 workspace，含模型步）→ 切换权限模式/模型 → 会话重命名/归档/历史/删除 → >100 会话分页 + >200 时间线向上分页 → 审批 actions → Git/文件 → 断网重连 resync + 草稿保留 → sticky 重连 → 解除 |

## Sources

- Vendored ChisaCode client/app pairing runtime
- Kill list：[_kill-http-remote](_kill-http-remote.md)
- Gap analysis：[2026-08-27-mobile-web-desktop-gap-analysis](../superpowers/plans/2026-08-27-mobile-web-desktop-gap-analysis.md)
- Phase 0 执行：[2026-08-27-mobile-web-phase0-execution](../superpowers/plans/2026-08-27-mobile-web-phase0-execution.md)
- Phase 1 执行：[2026-08-27-mobile-web-phase1-execution](../superpowers/plans/2026-08-27-mobile-web-phase1-execution.md)
