## 0.2.6

当前请用这一版。0.2.4 与 0.2.5 的安装包里，预置插件市场的运行时依赖不完整，部分用户一打开就是 `dsh 进程结束（code 1）`（缺 `undici`，或缺 `js-yaml` 的 ESM 入口）。请改装 0.2.6。不要再装 0.2.4 / 0.2.5。

[v0.2.0](https://github.com/ChisaAlter/Deepseek-Harness-Desktop/releases) 因启动失败已撤回。v0.2.1 与 v0.2.2 从未发出安装包。

### 安装包

- Windows x64：`Deepseek-Harness-Desktop-Setup-0.2.6.exe`
- macOS Apple Silicon（arm64）：`Deepseek-Harness-Desktop-0.2.6-mac-arm64.dmg`（未签名：下载后右键 → 打开；或执行 `xattr -cr /Applications/Deepseek-Harness-Desktop.app`）
- Intel Mac 与 Linux 仍请从源码运行

### 相对 0.2.5 的修复

- 打包不再把 Git 里残缺的 `node_modules` 当真相：安装包里的 `dshmarket` 在打包时用 npm 补齐运行时依赖（`undici`、`js-yaml` 及其入口文件）
- 门禁检查依赖的真实 `exports` / `module` / `main` 文件，缺 `js-yaml.mjs` 这类入口则构建失败
- 这些依赖若仍缺失，桌面不会把残缺市场插件写进 profile，Harness 还能启动（设置里暂时没有市场）

0.2.3 / 0.2.4 的功能说明仍适用：内置插件市场、壁纸图库、用户插件树恢复、终端与 Files 工作循环、浏览器预览。内置 Harness 仍钉在 `0.1.0-rc.7`。
