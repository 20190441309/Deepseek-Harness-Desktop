# Feature: Desktop launcher

| Field | Value |
| --- | --- |
| **id** | `desktop-launcher` |
| **status** | `active` |
| **last verified** | 2026-08-24 — 通用设置「启动时」与冷启动直进桌面；关闭桌面端销毁主窗 |

## User paths

1. 冷启动只开启动器窗，不立刻 `dsh web`。先查 GitHub 正式版：有新版本则询问；没有或跳过则启动桌面端。
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
- `/releases/latest` 忽略 draft；草稿 0.2.7 不得当成现网更新源。
- 换版本只下载该 tag 的 Setup 并拉起安装器，不单独切 `vendor/dsh` pin。
- 更新检查请求 10s 超时、单次下载整体 15 分钟超时；失败不阻塞手动「启动桌面端」。
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
- 本卡与 QA `TC-LAUNCH-*`

## Do not touch

- vendor harness
- 把 `--boot-*` 扩到启动器
- 在启动器里做市场、壁纸、完整官方设置

## Gates

| Kind | What |
| --- | --- |
| Automated | `launcher-gate` / `update` listReleases / `plugin-forensics` / IPC LAUNCHER 单测；`launcher-theme` / `officialShellBackground` / `windowBackgroundForShell` |
| Manual / QA | `TC-LAUNCH-001`…`007` |

## Sources

- Implementation：`src/main/launcher-gate.js`、`src/renderer/launcher.html`、`src/renderer/theme.js`、`src/shared/themes.js`
