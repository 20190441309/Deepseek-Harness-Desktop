# Feature: Desktop launcher

| Field | Value |
| --- | --- |
| **id** | `desktop-launcher` |
| **status** | `active` |
| **last verified** | 2026-08-24 — 更新检查/下载加超时；Release 带 SHA512SUMS.txt 时下载后强制校验 |

## User paths

1. 冷启动只开启动器窗，不立刻 `dsh web`。先查 GitHub 正式版：有新版本则询问；没有或跳过则启动桌面端。
2. 空桌面 `sessions/` 且官方 home / 用户技能根有可导入会话、附件、技能、可重装插件或 MCP 时停在导入，不自动启桌面。导入页分类勾选，可另选来源或技能目录；只拷勾选项到桌面 home。
3. 桌面就绪且「启动后退出启动器」为开 → 关启动器窗。启动失败则留在启动器并打开插件问诊。
4. 托盘 / 文件菜单「打开启动器」随时再打开。版本页可安装历史 Setup.exe。

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
