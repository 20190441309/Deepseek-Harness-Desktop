# Feature: Windows 安装器（NSIS 品牌化）

| Field | Value |
| --- | --- |
| **id** | `windows-installer` |
| **status** | `active` |
| **last verified** | 2026-08-25 — `node --test src/main/installer-branding.test.js`（配置/位图/nsh 门禁全绿）；Linux 云端无法实机跑 NSIS GUI，视觉走查待下一个 CI windows artifact（TC-INST-001） |

## User paths

1. 双击 Setup（GUI）：欢迎页（品牌侧栏：近黑画布 + 鲸标 + DeepSeek 蓝强调条，MUI 本地化中文/英文文案）→ MIT 许可页 → 安装模式/目录选择（可改目录）→ 安装进度（右上白底鲸标 header）→ 完成页（默认勾选「运行 Deepseek-Harness-Desktop」+ 产品仓库链接）。
2. 静默安装 `dsh-setup.exe /S`：跳过全部页面直接装完；同版本 overlay 与覆盖升级保留用户数据（QA TC-INST-009/012、dshbot smoke 依赖）。
3. 卸载（设置 → 应用 / 开始菜单）：品牌化卸载向导，灰阶侧栏区分移除语境；不删 `userData`（桌面 dsh-home、会话都在那里）。

## Invariants

- `oneClick: false`、`allowToChangeInstallationDirectory: true`、桌面 + 开始菜单快捷方式、artifact 名 `Deepseek-Harness-Desktop-Setup-${version}.exe` 不得变——release.yml globs、SHA512SUMS、桌面更新器都按这个名字找包。
- `/S` 静默安装必须保持可用。`build/installer.nsh` 只允许 `customWelcomePage` / `customHeader` 两个 GUI 宏；禁止 MessageBox、Section、RequestExecutionLevel、customInstall/customInit 等会影响静默/升级路径的内容。
- 默认 per-user 安装（`%LOCALAPPDATA%\Programs\Deepseek-Harness-Desktop`，TC-INST-013 依赖）；不设 `perMachine`，不设 `deleteAppDataOnUninstall`。
- 位图是经典 24 位无压缩 BMP，几何固定：sidebar 164×314、header 150×57。改品牌图先改 `scripts/render-installer-assets.js` 再 `npm run installer:assets` 重新生成，禁止手改二进制或另起配色——色板锚定 icon tile 近黑 `#0b0d12` / 亮 `#e8eef9` 与 DeepSeek 蓝 `rgb(65,118,230)`（`--dsw-static-deepseek-500` 的构建期镜像）。
- 安装器语言 zh_CN（首位 = 兜底）+ en_US；产品中文文案走 MUI 本地化串，不烙进位图。
- 许可页读根 `LICENSE`（MIT）原文。
- 安装器/卸载器图标 = `assets/icon.ico`（与应用同一鲸标）。

## Allowed touch

- `package.json` 的 `build.nsis` / `build.win` — 安装器配置
- `build/` — `installer.nsh` 与生成的 BMP
- `scripts/render-installer-assets.js`、`scripts/run-render-installer-assets.js` — 位图生成
- `src/main/installer-branding.test.js` — 自动门禁
- 本卡与 [build-release handbook](../handbook/modules/build-release.md)

## Do not touch

- `scripts/after-pack.js` 装配逻辑、SHA512SUMS / 更新器校验流
- artifact 命名与 `release.yml` 上传 globs
- mac DMG 配置（次要产物，独立演进）

## Gates

| Kind | What |
| --- | --- |
| Automated | `node --test src/main/installer-branding.test.js`（随 `npm test`）：nsis 契约、BMP 几何/位深、nsh 宏白名单、release.yml glob 对齐 |
| Manual / QA | `TC-INST-001`（GUI 安装走查）、`TC-INST-009`（`/S` 覆盖升级）、`TC-INST-010`（卸载）、`TC-INST-012/013` in [production-acceptance-test-cases.md](../qa/production-acceptance-test-cases.md)；每次改品牌位图后对 CI windows artifact 目检欢迎/许可/目录/完成/卸载五页 |

## Sources

- Design: [design-language.md](../design-language.md)（品牌蓝 / 近黑主色 / 鲸标），`assets/icon.svg`
- Spec: electron-builder NSIS 选项（assisted installer 默认无欢迎页、默认 `nsis3-metro.bmp` 侧栏——本卡替换为品牌资产）
- Implementation entry: `package.json` `build.nsis`、`build/installer.nsh`、`scripts/render-installer-assets.js`
