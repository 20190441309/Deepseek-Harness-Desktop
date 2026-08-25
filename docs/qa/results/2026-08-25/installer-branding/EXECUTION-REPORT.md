# 2026-08-25 · Windows 安装器品牌化 · Linux/wine 预验证

**对象：** 分支 `cursor/windows-installer-branding-5f26` 的 `build.nsis` 品牌化配置（欢迎/完成侧栏位图、header 位图、MIT 许可页、zh_CN+en_US、`build/installer.nsh`）。
**方法：** Linux 云端无 Windows 实机。用与仓库相同的 `build.nsis` 块 + 品牌资产搭 stub 工程，经仓库锁定的 electron-builder 26.15.3 完整跑 `--win nsis` 目标（makensis 原生编译 + wine 生成卸载器），产出 `Deepseek-Harness-Desktop-Setup-0.0.1.exe` + blockmap；再在 wine + Xvfb 下打开 GUI 向导逐页截图。

## 结果

| 检查 | 结果 | 证据 |
| --- | --- | --- |
| NSIS 脚本编译（installer.nsh 宏、位图、许可、双语言） | Pass — makensis 无错误出包 | stub 构建日志（Setup exe + blockmap 生成） |
| 欢迎页：品牌侧栏 + 三行标题 | Pass | [wizard-welcome.png](wizard-welcome.png) |
| 许可页：MIT 原文 + BrandingText `Deepseek-Harness-Desktop <version>` | Pass | [wizard-license.png](wizard-license.png) |
| 安装模式页：默认「仅为我安装」（per-user） | Pass | [wizard-install-mode.png](wizard-install-mode.png) |
| 目录页：鲸标 header、默认 `%LOCALAPPDATA%\Programs\Deepseek-Harness-Desktop`、可改目录 | Pass | [wizard-directory.png](wizard-directory.png) |
| 静默 `/S` 行为与旧配置一致 | Pass（归因级） — 新旧配置 stub 在 wine 下都因 wine 的运行中应用误检以 exit 2 中止：环境噪声，非本次改动引入。nsh 宏白名单单测保证品牌化只挂 GUI 页 | 对照 stub `/tmp/nsis-control`（旧配置）同样 exit 2 |

## 已知限制

- wine 不是 Windows：完成页（复用欢迎页侧栏位图 + 运行勾选 + 仓库链接）、卸载向导灰阶侧栏、真实 `/S` 静默安装与覆盖升级需在下一个 CI windows artifact 上按 TC-INST-001 / 009 / 010 实机走查。
- wine 下安装进度在解压阶段挂起（运行中应用误检循环），GUI 走查止于 Installing 页；不影响以上已验页面结论。
