## 0.2.7（待发）

### 相对 0.2.6 的修复

- 终端 Ghostty wasm/字体随客户端构建写入 `lib/assets`（根 `build:lib:client` 会跑 `copy-ghostty-assets`）
- 打包门禁：`afterPack` 在归档前补齐并校验 `dirname(client.js)/assets`，缺文件则失败
- 已安装不完整运行时（缺 wasm 导致 `Unable to load libghostty-vt (404)`）会在下次启动时重新解压

## 0.2.6

当前已发出的安装包仍是 0.2.6。若终端页出现 `Unable to load libghostty-vt (404)`，请改装即将发布的 0.2.7，或从源码构建。

0.2.4 与 0.2.5 的安装包里，预置插件市场的运行时依赖不完整，部分用户一打开就是 `dsh 进程结束（code 1）`（缺 `undici`，或缺 `js-yaml` 的 ESM 入口）。请改装 0.2.6 或更新。不要再装 0.2.4 / 0.2.5。

[v0.2.0](https://github.com/ChisaAlter/Deepseek-Harness-Desktop/releases) 因启动失败已撤回。v0.2.1 与 v0.2.2 从未发出安装包。

### 安装包

- Windows x64：`Deepseek-Harness-Desktop-Setup-0.2.6.exe`
- macOS Apple Silicon（arm64）：`Deepseek-Harness-Desktop-0.2.6-mac-arm64.dmg`（未签名：下载后右键 → 打开；或执行 `xattr -cr /Applications/Deepseek-Harness-Desktop.app`）
- Intel Mac 与 Linux 仍请从源码运行

### 相对 0.2.5 的修复

- 打包不再把 Git 里残缺的 `node_modules` 当真相：安装包里的 `dshmarket` 在打包时用 npm 补齐运行时依赖（`undici`、`js-yaml` 及其入口文件）
- 门禁检查依赖的真实 `exports` / `module` / `main` 文件，缺 `js-yaml.mjs` 这类入口则构建失败
- 这些依赖若仍缺失，桌面不会把残缺市场插件写进 profile，Harness 还能启动（设置里暂时没有市场）

0.2.3 / 0.2.4 的功能说明仍适用：内置插件市场、壁纸图库、用户插件树恢复、终端与 Files 工作循环、浏览器预览。已发布的 0.2.6 安装包当时钉的是 `0.1.0-rc.7`。当前仓库源码钉是 `0.1.0-rc.8`（`dsh-v0.1.0-rc.8` / `141eb6fef83422698aef7a981029e843e8161534`，见 `vendor/harness-upstream.json`）。不要把已发出的 0.2.6 安装包说成 rc.8。
