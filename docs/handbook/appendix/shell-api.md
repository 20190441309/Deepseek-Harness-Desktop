# 附录：`window.shell` 能力索引

来源：[`src/preload/index.js`](../../../src/preload/index.js)。角色由 `--dshd-shell-role=boot|harness` 决定；仅主 frame 暴露。

## Boot 角色

| API | IPC channel |
| --- | --- |
| `windowAction` | `shell:window` (send) |
| `getWindowState` | `shell:window-state` |
| `onWindowState` | `shell:window-state` |
| `onTheme` | `shell:theme` |
| `getConfig` | `shell:get-config` |
| `getState` | `shell:get-state` |
| `restart` | `shell:restart` |
| `cancelRestart` | `shell:cancel-restart` |
| `saveBootLog` | `shell:save-boot-log` |
| `onState` | `shell:state` |
| `onLog` | `shell:log` |
| `onPluginBoot` | `shell:plugin-boot` |

## Harness 角色（含窗口 + 配置）

窗口与配置同 boot 的 `windowApi` + `configApi`（含 `saveConfig`），并增加：

### 壳 / 设置 / 更新 / 插件

| API | Channel |
| --- | --- |
| `pickWorkspace` | `shell:pick-workspace` |
| `openExternal` | `shell:open-external` |
| `openSettings` | `shell:open-settings` |
| `retryFullPlugins` | `shell:retry-full-plugins` |
| `checkUpdate` / `installUpdate` | `shell:check-update` / `shell:install-update` |
| `onUpdateProgress` | `shell:update-progress` |
| `reportChrome` | `shell:chrome-metrics` (send) |
| `listMarketplace` / `refreshMarketplace` | `shell:list-marketplace` / `shell:refresh-marketplace` |
| `listWallpaperCatalog` / `downloadWallpaper` | `shell:list-wallpaper-catalog` / `shell:download-wallpaper` |
| `listInstalledPlugins` | `shell:list-installed-plugins` |
| `installPlugin` / `installMarketplacePlugin` / `uninstallPlugin` | `shell:install-plugin` / `shell:install-marketplace-plugin` / `shell:uninstall-plugin` |
| `openMarketplace` | `shell:open-marketplace` |
| `onPluginProgress` | `shell:plugin-progress` |

### Git

`gitStatus`、`gitFetchForStatus`、`gitReadPullRequest`、`gitInit`、`gitDiff`、`gitCommit`、`gitPush`、`gitPull`、`gitCreateChangeRequest`、`gitPublishRepository`、`gitStage`、`gitUnstage`、`gitDiscard`、`gitStatusEntries`、`gitBranchList`、`gitSwitchBranch`、`gitCreateBranch`、`onGitProgress` — channel 前缀 `shell:git-*` / `shell:git-progress`。

### 工作区 FS

`openWorkspacePath`、`listDir`、`readFile`、`readFileMedia`、`writeFile`、`listEditors`、`openInEditor`、`showItemInFolder`、`openWithSystemDefault`。

### PTY

`ptyCreate`、`ptyWrite`、`ptyResize`、`ptyKill`、`onPtyData`、`onPtyExit`。

### Preview（Browser surface）

`previewOpen` … `previewClose`、自动化系列 `previewAutomation*`、订阅 `onPreviewStateChange` / `onOpenPreviewUrl` / `onPreviewRecordingFrame` — 详见 preload 同文件列表。

## 维护

增删 API 时同步本附录与 `shell-api.test.js`；手册模块章只链到本页，不复制全表。
