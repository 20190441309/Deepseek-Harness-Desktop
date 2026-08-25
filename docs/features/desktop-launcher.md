# Feature: Desktop launcher

| Field | Value |
| --- | --- |
| **id** | `desktop-launcher` |
| **status** | `active` |
| **last verified** | 2026-08-25 — 冷启动闸门抽入 `launcher-gate.runColdStartGate`：更新询问/下载挂可见启动器、失败回首页不留无窗进程；`downloadFile` 断流/截断防护；`last-desktop-start.json` 写入方统一；v0.2.7 正式发布（启动器随 Setup）、`/releases/latest` 指向 0.2.7 |

## User paths

1. 冷启动只开启动器窗，不立刻 `dsh web`。先查 GitHub 正式版：有新版本则**先打开启动器窗再询问**（弹框与下载进度都落在可见启动器上）；没有或跳过则启动桌面端。用户选「更新」后下载/校验失败、只打开发布页、或源码运行拉起安装器时，回启动器首页并提示，「启动桌面端」仍可手动进桌面；仅 packaged 且安装器已拉起时等待应用退出。
2. 空桌面 `sessions/` 且官方 home / 用户技能根有可导入会话、附件、技能、可重装插件或 MCP 时停在导入，不自动启桌面。导入页分类勾选，可另选来源或技能目录；只拷勾选项到桌面 home。
3. 桌面就绪且「启动后退出启动器」为开 → 关启动器窗，**仅**在完整健康启动（`lastStart.ok===true`、非 sticky skip、非 recovery 启动）时生效。启动失败或 sticky skip 时留在启动器并展开首页 **Recovery Board**（全插件名单、归因、逐项开关、批量禁用可疑）。跳过用户插件后点「启动桌面端」会清 sticky 并强制重启。插件排查与首页共用同一插件名单渲染；禁用/启用在内核 `ready|starting|error` 时经 `startHarness` 对齐名单，**不**走会关启动器的 `startDesktop`。
4. 托盘 / 文件菜单「打开启动器」随时再打开。版本页展示本机已安装版本与路径（源码运行时标注 package.json 版本；若注册表有 Setup 则显示其版本与路径），可刷新 GitHub 正式版列表、更新/切换 Setup，或启动 Windows 卸载程序 / 打开「设置 → 应用」移除本机应用（NSIS 单实例，不能并列多版本）。
5. 导入 / 移除在曾停止内核时提示需在首页再启；boot 页 `shell:restart` 仍走 `retryFullPlugins`（清 skip）；启动器 `shell:retry-full-plugins` 走 `startDesktopFromLauncher({ recoveryLaunch, forceRestart })`。
6. 桌面端运行中（`ready|starting`）时首页主按钮为「关闭桌面端」，经 `shell:stop-desktop` 仅停内核并隐藏主窗，启动器保持打开。导入页「重新扫描」显示进度并保留勾选与会话分组折叠状态。
7. 桌面端「通用设置 → 启动时」与启动器「打开后自动启动桌面端」共用 `autoStartDesktop`：是则冷启动跳过启动器直进桌面（启动器经托盘右键）；否则先开启动器。待导入 / 更新确认 / 上次启动失败时仍先开启动器。

## Invariants

- 同一 Electron 进程、同一安装包；不是第二套 exe。
- 启动器走官方 `--dsw-alias-*`；`--boot-*` 不得用在启动器页。
- 启动器浅色/深色跟官方 dsh web 表（`data-ds-dark-theme`），不把 Appearance 壁纸种子写进 token。
- 市场 / 壁纸图库仍禁止另开产品窗。
- `/releases/latest` 忽略 draft；正式版 0.2.7 起启动器随 Setup 提供。
- 换版本只下载该 tag 的 Setup 并拉起安装器，不单独切 `vendor/dsh` pin。
- 更新检查请求 10s 超时、单次下载整体 15 分钟超时；正文中断（error/aborted）或落盘字节与 content-length 不符视为失败并删除半成品；失败不阻塞手动「启动桌面端」。
- 冷启动更新流程绝不留下无窗进程：更新询问前必须 `openLauncher()`；接受更新后除「packaged 且安装器已拉起（随后 app.quit）」外一律落回启动器首页（错误/结果写入 `shell:launcher-hint`），auto start 在该轮被 hold（`shouldAutoStartDesktop.updateFlowHold`）。编排在 `launcher-gate.runColdStartGate`（依赖注入、单测覆盖）。
- `last-desktop-start.json` 写入方唯一集合：启动器 `startDesktopFromLauncher`、boot 页 `shell:restart` / boot `shell:retry-full-plugins`、菜单/托盘/插件对齐 `restartWithCleanup`（经 `recordLastDesktopStart`）。成功写 `{ok:true}`，失败写 `{ok:false, error}`；launcher 角色 `shell:retry-full-plugins`/`shell:start-desktop` 由 `startDesktopFromLauncher` 代写，不双写。
- sticky skip 判定唯一实现 `launcher-gate.stickySkipActive({pluginRecovery, appVersion})`；ipc 与 `HarnessController.shouldSkipUserPlugins` 共用（后者负责清掉跨版本的陈旧标记）。
- OS 浅深色切换经 `chrome.watchSystemTheme`（`nativeTheme updated` → `applyAppTheme`）即时重绘窗口背景。
- Release 若带 `SHA512SUMS.txt`，下载后强制 sha512 校验（失败即删除并报错）；老版本 Release 无清单则跳过校验（已知限制，见 build-release handbook）。
- 关启动器：桌面主窗还在则只关启动器；主窗不在则退出应用。
- `readLastDesktopStart` 三态：缺文件 `{ ok:null }`（不挡 auto start）；失败 `{ ok:false }`；成功 `{ ok:true }`。
- 「启动桌面端」清除「跳过用户插件」sticky 时必须 `forceRestart`；`HarnessController.restart()` 不得把旧 in-flight Promise 交给新调用方（先 await 再开新 `replaceOperation`）。
- 插件排查禁用/启用写盘后若内核在跑，只经 `startHarness`/`restartWithCleanup` 对齐，不得经 `startDesktopFromLauncher`（避免 `quitAfterStart` 关掉排查窗）。批量禁用可疑走 `shell:disable-plugins`（一次写盘 + 一次 align）。
- 「跳过用户插件」救生启动不 ensure market/usage/dshbot（`hideDshbotPlugin`）；`DSHBOT_FEATURE_ENABLED === false` 时完整启动亦 hide dshbot。desktop-install 仍 required。可选桌面预置不得拖垮恢复通道。
- Recovery Board 在 sticky skip、`lastStart.ok===false`、desktop error、genericCause、pluginTreeFailure 或存在 suspects 时于首页展开。
- `shell:stop-desktop`（启动器专用）取消 harness 自动恢复与在途 restart/start、停止 dsh 内核、清理 PTY/预览并销毁主窗；托盘在内核未运行时打开启动器；不退出 Electron 进程、不关启动器。
- 版本页 `listReleases` 附带 `installed`（运行模式、注册表 Setup 版本/路径、是否可卸载）；卸载优先 NSIS `Uninstall*.exe`，否则打开「设置 → 应用」；源码运行且无注册表安装时隐藏卸载按钮并给出明确说明。
- 导入重新扫描保留 session-rel / skill-id / plugin-name / mcp-id 勾选与会话分组折叠；扫描完成展示计数与时间戳。

## Allowed touch

- `src/main/window.js` 启动器窗、`src/renderer/launcher.*`
- `src/renderer/theme.js`、`src/main/chrome.js`、`src/shared/themes.js`
- `src/main/launcher-gate.js`、`src/main/update.js`、`src/main/plugin-forensics.js`
- `src/main/index.js` 冷启动闸门、`src/main/ipc.js`、`src/preload/index.js`、托盘/菜单
- `src/main/harness-controller.js` 仅限 sticky skip 判定委托给 `launcher-gate.stickySkipActive`（不动生命周期语义）
- 本卡与 QA `TC-LAUNCH-*`

## Do not touch

- vendor harness
- 把 `--boot-*` 扩到启动器
- 在启动器里做市场、壁纸、完整官方设置

## Gates

| Kind | What |
| --- | --- |
| Automated | `launcher-gate`（含 `runColdStartGate` 编排 / `stickySkipActive` / `recordLastDesktopStart`）/ `update`（listReleases、downloadFile 断流/截断）/ `plugin-forensics` / IPC LAUNCHER 单测；`launcher-theme` / `officialShellBackground` / `windowBackgroundForShell`；`chrome-theme` watchSystemTheme |
| Manual / QA | `TC-LAUNCH-001`…`008` |

## Sources

- Implementation：`src/main/launcher-gate.js`、`src/renderer/launcher.html`、`src/renderer/theme.js`、`src/shared/themes.js`
